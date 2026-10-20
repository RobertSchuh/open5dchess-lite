// Hypercuboid legal-action search, ported from the algorithm documented in
// ftxi/5dchess_engine (BSD-2-Clause) docs/hypercuboid.md + graph-matching.md,
// running on THIS engine's move generation so rule compatibility with the
// rest of the server is by construction.
//
// An action is a point in a hypercuboid whose axes are the playable boards
// plus the creatable timelines; each axis holds semimoves (null / physical /
// departure / arrival). The search repeatedly takes a matching-consistent
// point, tests it, and on failure removes a whole problem SLICE (a Cartesian
// product refuted by one surviving check or ordering conflict) instead of a
// single point. Exhaustion of the space proves checkmate/stalemate.
//
// This module is self-contained over small ints: the universe builder maps
// engine moves (Mv) to per-axis semimove ids; slices and hypercuboids are
// bitsets over those ids.

/// A set of semimove ids on one axis, as a bitset.
#[derive(Clone, PartialEq, Debug)]
pub struct AxisSet {
    pub bits: Vec<u64>,
}

impl AxisSet {
    pub fn empty(n: usize) -> AxisSet {
        AxisSet { bits: vec![0; (n + 63) / 64] }
    }
    pub fn full(n: usize) -> AxisSet {
        let mut s = AxisSet::empty(n);
        for i in 0..n { s.insert(i); }
        s
    }
    pub fn insert(&mut self, i: usize) { self.bits[i / 64] |= 1u64 << (i % 64); }
    pub fn remove(&mut self, i: usize) { self.bits[i / 64] &= !(1u64 << (i % 64)); }
    pub fn contains(&self, i: usize) -> bool { self.bits[i / 64] >> (i % 64) & 1 == 1 }
    pub fn is_empty(&self) -> bool { self.bits.iter().all(|&w| w == 0) }
    pub fn count(&self) -> usize { self.bits.iter().map(|w| w.count_ones() as usize).sum() }
    pub fn first(&self) -> Option<usize> {
        for (wi, &w) in self.bits.iter().enumerate() {
            if w != 0 { return Some(wi * 64 + w.trailing_zeros() as usize); }
        }
        None
    }
    pub fn iter(&self) -> impl Iterator<Item = usize> + '_ {
        self.bits.iter().enumerate().flat_map(|(wi, &w)| {
            let mut v = w;
            std::iter::from_fn(move || {
                if v == 0 { return None; }
                let b = v.trailing_zeros() as usize;
                v &= v - 1;
                Some(wi * 64 + b)
            })
        })
    }
    pub fn intersect(&self, other: &AxisSet) -> AxisSet {
        AxisSet { bits: self.bits.iter().zip(&other.bits).map(|(a, b)| a & b).collect() }
    }
    pub fn subtract(&self, other: &AxisSet) -> AxisSet {
        AxisSet { bits: self.bits.iter().zip(&other.bits).map(|(a, b)| a & !b).collect() }
    }
    pub fn intersects(&self, other: &AxisSet) -> bool {
        self.bits.iter().zip(&other.bits).any(|(a, b)| a & b != 0)
    }
}

/// A hypercuboid: one semimove set per axis. Empty on any axis = empty.
#[derive(Clone, Debug)]
pub struct Hypercuboid {
    pub axes: Vec<AxisSet>,
}

impl Hypercuboid {
    pub fn is_empty(&self) -> bool { self.axes.iter().any(|a| a.is_empty()) }
    /// log2-ish volume for diagnostics
    pub fn volume_log2(&self) -> f64 {
        self.axes.iter().map(|a| (a.count().max(1) as f64).log2()).sum()
    }
}

/// A slice: the Cartesian product of restrictions on SOME axes (None = the
/// full axis). Removing it from a hypercuboid yields up to `restricted axes`
/// disjoint hypercuboids.
#[derive(Clone, Debug)]
pub struct Slice {
    pub restr: Vec<Option<AxisSet>>,
}

impl Slice {
    pub fn point(ids: &[usize], sizes: &[usize]) -> Slice {
        Slice {
            restr: ids.iter().zip(sizes).map(|(&id, &n)| {
                let mut s = AxisSet::empty(n);
                s.insert(id);
                Some(s)
            }).collect(),
        }
    }
    pub fn codim(&self) -> usize { self.restr.iter().filter(|r| r.is_some()).count() }
    pub fn intersects(&self, hc: &Hypercuboid) -> bool {
        self.restr.iter().zip(&hc.axes).all(|(r, a)| match r {
            None => !a.is_empty(),
            Some(s) => s.intersects(a),
        })
    }
}

/// Remove `slice` from `hc`, returning the remaining disjoint hypercuboids.
/// Standard complement decomposition: for the k-th restricted axis, emit a
/// copy restricted to the slice on axes before it and to the complement on
/// axis k itself.
pub fn remove_slice(hc: &Hypercuboid, slice: &Slice) -> Vec<Hypercuboid> {
    if !slice.intersects(hc) { return vec![hc.clone()]; }
    let mut out = Vec::new();
    let mut prefix = hc.clone(); // axes before k intersected with the slice
    for (k, r) in slice.restr.iter().enumerate() {
        if let Some(s) = r {
            let mut piece = prefix.clone();
            piece.axes[k] = prefix.axes[k].subtract(s);
            if !piece.is_empty() { out.push(piece); }
            prefix.axes[k] = prefix.axes[k].intersect(s);
            if prefix.axes[k].is_empty() { return out; }
        }
    }
    // prefix is now entirely inside the slice: dropped.
    out
}

/// General matching with required vertices (Edmonds blossom, iterative
/// contraction via base pointers; see graph-matching.md).
/// Vertices 0..n; `adj[v]` lists neighbors; `required[v]` marks vertices that
/// must be covered. Returns mate[v] (usize::MAX = unmatched) or None if no
/// matching covers all required vertices.
pub fn find_matching(adj: &[Vec<usize>], required: &[bool]) -> Option<Vec<usize>> {
    const NONE: usize = usize::MAX;
    let n = adj.len();
    let mut mate = vec![NONE; n];

    //One BFS phase per uncovered required vertex: find an alternating path
    //from `root` that ends at an unmatched vertex, or at a matched vertex
    //whose partner is not required (the partner gives its match up). Classic
    //blossom contraction via base[] (e-maxx formulation): p[] holds the BFS
    //parent of ODD vertices; blossoms re-root their members' p[] so augmenting
    //paths lift through contracted cycles.
    loop {
        let root = match (0..n).find(|&v| required[v] && mate[v] == NONE) {
            Some(v) => v,
            None => return Some(mate),
        };
        let mut p = vec![NONE; n];
        let mut base: Vec<usize> = (0..n).collect();
        let mut used = vec![false; n];
        used[root] = true;
        let mut q = std::collections::VecDeque::new();
        q.push_back(root);

        let lca = |base: &Vec<usize>, p: &Vec<usize>, mate: &Vec<usize>, mut a: usize, mut b: usize| -> usize {
            let mut marked = vec![false; base.len()];
            loop {
                a = base[a];
                marked[a] = true;
                if mate[a] == NONE { break; } //reached the (unmatched) root
                a = p[mate[a]];
            }
            loop {
                b = base[b];
                if marked[b] { return b; }
                b = p[mate[b]];
            }
        };
        let mark_path = |blossom: &mut Vec<bool>, base: &Vec<usize>, p: &mut Vec<usize>,
                         mate: &Vec<usize>, mut v: usize, b: usize, mut child: usize| {
            while base[v] != b {
                blossom[base[v]] = true;
                blossom[base[mate[v]]] = true;
                p[v] = child;
                child = mate[v];
                v = p[mate[v]];
            }
        };
        //flip matches along the alternating path ending at odd vertex `v`
        let augment = |mate: &mut Vec<usize>, p: &Vec<usize>, mut v: usize| {
            while v != NONE {
                let pv = p[v];
                let next = if pv == NONE { NONE } else { mate[pv] };
                mate[v] = pv;
                if pv != NONE { mate[pv] = v; }
                v = next;
            }
        };

        let mut augmented = false;
        'bfs: while let Some(v) = q.pop_front() {
            for &to in &adj[v] {
                if base[v] == base[to] || mate[v] == to { continue; }
                if to == root || (mate[to] != NONE && p[mate[to]] != NONE) {
                    //odd cycle: contract the blossom around the common base
                    let cur = lca(&base, &p, &mate, v, to);
                    let mut blossom = vec![false; n];
                    mark_path(&mut blossom, &base, &mut p, &mate, v, cur, to);
                    mark_path(&mut blossom, &base, &mut p, &mate, to, cur, v);
                    for i in 0..n {
                        if blossom[base[i]] {
                            base[i] = cur;
                            if !used[i] {
                                used[i] = true;
                                q.push_back(i);
                            }
                        }
                    }
                }
                else if p[to] == NONE {
                    p[to] = v;
                    if mate[to] == NONE {
                        //path ends at a free vertex
                        augment(&mut mate, &p, to);
                        augmented = true;
                        break 'bfs;
                    }
                    let w = mate[to];
                    if !required[w] {
                        //path may end here: w is optional and donates its match
                        augment(&mut mate, &p, to);
                        if mate[w] == to { mate[w] = NONE; }
                        augmented = true;
                        break 'bfs;
                    }
                    used[w] = true;
                    q.push_back(w);
                }
            }
        }
        if !augmented { return None; }
    }
}

//=== Universe over engine moves ===============================================
use crate::{
    apply, checks, gen_moves, now_ms, piece_at, pos_exists, present_timelines, ray_vec,
    timeline_move, undo, Arena, Mv, Pos, P4, NO, TIMEOUT, YES,
};

/// One semimove. `u32` ids index `Universe::moves`.
#[derive(Clone, Copy, Debug)]
pub(crate) enum Sm {
    Null,
    Physical(u32),
    /// A piece leaves this square (landing info lives in the matched arrival)
    Departure(P4),
    /// Non-branching jump landing on this axis's latest board
    Arrival(u32),
    /// Branching jump creating this (new-timeline) axis
    Branch(u32),
}

pub(crate) struct Axis {
    /// Some(l): the playable timeline this axis moves; None: a new timeline
    pub tl: Option<usize>,
    pub present: bool, //playable and at the present when the universe was built
    pub sms: Vec<Sm>,
}

pub(crate) struct Universe {
    pub moves: Vec<Mv>,
    pub axes: Vec<Axis>,
    /// Turn (half-move units) of the present when the universe was built
    /// (kept for diagnostics; the slice logic reads clear_floor instead)
    #[allow(dead_code)]
    pub present_t: i32,
    /// timeline slot -> playable axis index
    pub axis_of_tl: Vec<Option<usize>>,
    /// Would the mover's first new timeline be active? (Later ones are only
    /// active if earlier ones are: the opposite side's count is fixed.)
    pub first_new_slot_active: bool,
    /// Reactivation hammer: the mover's branching (up to one per new axis)
    /// could reactivate a stale timeline whose top board awaits the OPPONENT
    /// while its mover-parity top sits below the present. Activating it can
    /// empty the present list with no pinnable witness, so present slices
    /// must exclude every branch.
    pub react_hammer: bool,
    /// Saviors: (playable axis, branches needed to reactivate, top turn) of
    /// reactivatable timelines whose TOP board awaits the mover below the
    /// present. Reactivated and left unmoved, such a line realizes the
    /// lowered present (still a failing pass), so present slices pin these
    /// axes to Null instead of excluding branches.
    pub saviors: Vec<(usize, usize, i32)>,
    /// Branches arriving below this (= the present lowered by any saviors a
    /// single branch reactivates) can clear the present and legalize a pass;
    /// present slices exclude them. Branches at or above it ride free.
    pub clear_floor: i32,
}

fn is_branching(p: &Pos, m: &Mv) -> bool {
    //non-physical jump whose destination board is not the latest of its timeline
    if m.d.l == m.s.l && m.d.t == m.s.t {
        return false;
    }
    let tl = p.tls[m.d.l as usize].as_ref().unwrap();
    (tl.len() - 1) as i32 != m.d.t
}

pub(crate) fn build_universe(p: &Pos, arena: &mut Arena) -> Universe {
    let mut moves: Vec<Mv> = Vec::new();
    gen_moves(p, arena, &mut moves);
    let parity = (p.action % 2) as usize;

    //Playable axes: every timeline whose latest board awaits the player
    let mut axis_of_tl: Vec<Option<usize>> = vec![None; p.tls.len()];
    let mut axes: Vec<Axis> = Vec::new();
    let mut present0: Vec<usize> = Vec::new();
    present_timelines(p, &mut present0);
    let present_t = present0
        .first()
        .map(|&l| (p.tls[l].as_ref().unwrap().len() - 1) as i32)
        .unwrap_or(0);
    for l in 0..p.tls.len() {
        let tl = match &p.tls[l] {
            Some(tl) => tl,
            None => continue,
        };
        let t = tl.len() - 1;
        if t % 2 != parity || tl[t] < 0 {
            continue;
        }
        axis_of_tl[l] = Some(axes.len());
        axes.push(Axis { tl: Some(l), present: present0.contains(&l), sms: vec![Sm::Null] });
    }

    //Classify moves; collect branching ids and sources with a branching move
    let mut branching: Vec<u32> = Vec::new();
    let mut branch_sources: Vec<bool> = vec![false; axes.len()];
    for (i, m) in moves.iter().enumerate() {
        let src_axis = match axis_of_tl[m.s.l as usize] {
            Some(a) => a,
            None => continue,
        };
        if m.d.l == m.s.l && m.d.t == m.s.t {
            axes[src_axis].sms.push(Sm::Physical(i as u32));
            continue;
        }
        //jump: record the (deduplicated) departure on the source axis
        let dep_known = axes[src_axis].sms.iter().any(|s| match s {
            Sm::Departure(d) => *d == m.s,
            _ => false,
        });
        if !dep_known {
            axes[src_axis].sms.push(Sm::Departure(m.s));
        }
        if is_branching(p, m) {
            branching.push(i as u32);
            branch_sources[src_axis] = true;
        } else {
            let dest_axis = axis_of_tl[m.d.l as usize]
                .expect("non-branching jump lands on a playable latest board");
            axes[dest_axis].sms.push(Sm::Arrival(i as u32));
        }
    }

    //One new-timeline axis per playable board that can branch away
    let k = branch_sources.iter().filter(|&&b| b).count();
    for _ in 0..k {
        let mut sms: Vec<Sm> = Vec::with_capacity(branching.len() + 1);
        sms.push(Sm::Null);
        for &i in &branching {
            sms.push(Sm::Branch(i));
        }
        axes.push(Axis { tl: None, present: false, sms });
    }

    //Present-slice activity facts (see the present test in test_point). All
    //branch destinations share the mover's half-turn parity (time steps are
    //full turns), so the mover's new slots land in ONE slot-parity family,
    //whose growth is known upfront. Mirrors present_timelines' is_active.
    let mut min_tl: usize = 0; //highest odd slot
    let mut max_tl: usize = 0; //highest even slot
    for l in 0..p.tls.len() {
        if p.tls[l].is_none() {
            continue;
        }
        if l % 2 != 0 && min_tl < l {
            min_tl = l;
        }
        if l % 2 == 0 && max_tl < l {
            max_tl = l;
        }
    }
    let first_new_slot_active = if parity == 0 {
        let l_new = if max_tl == 0 { 2 } else { max_tl + 2 };
        l_new <= min_tl + 3
    } else {
        let l_new = if min_tl == 0 { 1 } else { min_tl + 2 };
        l_new <= max_tl + 1
    };
    let is_active =
        |l: usize, mn: usize, mx: usize| if l % 2 != 0 { mx + 1 >= l } else { mn + 3 >= l };
    let mut react_hammer = false;
    let mut saviors: Vec<(usize, usize, i32)> = Vec::new();
    let mut clear_floor: i32 = present_t;
    if k > 0 {
        //walk the activity window as the mover branches 1..=k times; classify
        //each timeline the widening reactivates
        let (mut mn, mut mx) = (min_tl, max_tl);
        for step in 1..=k {
            let (pmn, pmx) = (mn, mx);
            if parity == 0 {
                mx = if mx == 0 { 2 } else { mx + 2 };
            } else {
                mn = if mn == 0 { 1 } else { mn + 2 };
            }
            for l in 0..p.tls.len() {
                let tl = match &p.tls[l] {
                    Some(tl) => tl,
                    None => continue,
                };
                if is_active(l, pmn, pmx) || !is_active(l, mn, mx) {
                    continue;
                }
                let overall = tl.iter().rposition(|&b| b >= 0).map(|t| t as i32).unwrap_or(-1);
                let mut mover_top: i32 = -1;
                for t in (0..tl.len()).rev() {
                    if tl[t] >= 0 && t % 2 == parity {
                        mover_top = t as i32;
                        break;
                    }
                }
                if mover_top >= present_t {
                    continue; //cannot lower the present: harmless
                }
                if overall == mover_top {
                    //top board awaits the mover below the present: a savior -
                    //reactivated and unmoved it realizes the lowered present
                    saviors.push((axis_of_tl[l].expect("savior tip is playable"), step, mover_top));
                    if step == 1 && mover_top < clear_floor {
                        clear_floor = mover_top;
                    }
                } else {
                    react_hammer = true;
                }
            }
        }
    }
    #[cfg(not(target_arch = "wasm32"))]
    if std::env::var("HC_DEBUG").is_ok() {
        eprintln!(
            "universe: parity {} present_t {} min_tl {} max_tl {} k {} first_active {} hammer {} saviors {:?} clear_floor {}",
            parity, present_t, min_tl, max_tl, k, first_new_slot_active, react_hammer,
            saviors, clear_floor
        );
    }
    Universe {
        moves,
        axes,
        present_t,
        axis_of_tl,
        first_new_slot_active,
        react_hammer,
        saviors,
        clear_floor,
    }
}

pub(crate) fn full_hypercuboid(u: &Universe) -> Hypercuboid {
    Hypercuboid { axes: u.axes.iter().map(|a| AxisSet::full(a.sms.len())).collect() }
}

//=== Take a point =============================================================

/// Pick one semimove id per axis, consistent in the matching sense: every
/// chosen departure pairs with exactly one chosen arrival/branch and
/// vice-versa. Returns None when the hypercuboid cannot host such a point
/// (axes forced to jumps with no feasible pairing).
pub(crate) fn take_point(u: &Universe, hc: &Hypercuboid) -> Option<Vec<usize>> {
    let n = u.axes.len();
    //Independent (jump-free) fallback per axis, preferring progress on
    //present boards and quiet on everything else.
    let mut fallback: Vec<Option<usize>> = vec![None; n];
    for (a, axis) in u.axes.iter().enumerate() {
        let mut null_id = None;
        let mut phys_id = None;
        for id in hc.axes[a].iter() {
            match axis.sms[id] {
                Sm::Null if null_id.is_none() => null_id = Some(id),
                Sm::Physical(_) if phys_id.is_none() => phys_id = Some(id),
                _ => {}
            }
        }
        fallback[a] = if axis.present { phys_id.or(null_id) } else { null_id.or(phys_id) };
    }
    let required: Vec<bool> = fallback.iter().map(|f| f.is_none()).collect();
    if required.iter().all(|&r| !r) {
        return Some(fallback.into_iter().map(|f| f.unwrap()).collect());
    }

    //Pair graph: departure axis <-> axis holding a matching arrival/branch
    let mv_of = |a: usize, id: usize| -> Option<&Mv> {
        match u.axes[a].sms[id] {
            Sm::Arrival(i) | Sm::Branch(i) => Some(&u.moves[i as usize]),
            _ => None,
        }
    };
    let dep_allowed = |a: usize, s: P4| -> Option<usize> {
        hc.axes[a].iter().find(|&id| matches!(u.axes[a].sms[id], Sm::Departure(d) if d == s))
    };
    let mut adj: Vec<Vec<usize>> = vec![Vec::new(); n];
    for b in 0..n {
        for id in hc.axes[b].iter() {
            if let Some(m) = mv_of(b, id) {
                if let Some(sa) = u.axis_of_tl.get(m.s.l as usize).copied().flatten() {
                    if sa != b && dep_allowed(sa, m.s).is_some() && !adj[b].contains(&sa) {
                        adj[b].push(sa);
                        adj[sa].push(b);
                    }
                }
            }
        }
    }
    let mate = find_matching(&adj, &required)?;

    //Concrete semimoves for matched pairs; fallback elsewhere
    let mut point: Vec<usize> = vec![usize::MAX; n];
    for b in 0..n {
        if mate[b] == usize::MAX || point[b] != usize::MAX {
            continue;
        }
        let a = mate[b];
        //one of (a, b) holds the arrival; find a concrete pair
        let mut place = |arr_axis: usize, dep_axis: usize| -> bool {
            for id in hc.axes[arr_axis].iter() {
                if let Some(m) = mv_of(arr_axis, id) {
                    if m.s.l as usize == u.axes[dep_axis].tl.unwrap_or(usize::MAX) {
                        if let Some(dep_id) = dep_allowed(dep_axis, m.s) {
                            point[arr_axis] = id;
                            point[dep_axis] = dep_id;
                            return true;
                        }
                    }
                }
            }
            false
        };
        if !place(b, a) && !place(a, b) {
            return None; //matching said pairable, but no concrete pair: give up
        }
    }
    for a in 0..n {
        if point[a] == usize::MAX {
            point[a] = fallback[a]?;
        }
    }
    Some(point)
}

//=== Test a point =============================================================

pub(crate) enum Problem {
    /// The point is a legal action (these are its moves, in applied order)
    Legal(Vec<Mv>),
    /// A slice of invalid points containing this point. The bool marks slices
    /// whose soundness argument is universe-global (safe to propagate into
    /// every hypercuboid); the rest are removed from the current one only.
    Slice(Slice, bool),
}

/// Which axis produced the post-action board (l, t)? Boards older than the
/// action are immutable (None).
struct BoardOwner {
    //(timeline, turn) -> axis, for boards created by the applied moves
    map: Vec<(i32, i32, usize)>,
}
impl BoardOwner {
    fn get(&self, l: i32, t: i32) -> Option<usize> {
        self.map.iter().find(|&&(ol, ot, _)| ol == l && ot == t).map(|&(_, _, a)| a)
    }
}

pub(crate) static PRESENT_SLICES: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
pub(crate) static CHECK_SLICES: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
pub(crate) static INTRINSIC_SLICES: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
pub(crate) static NEWINV_SLICES: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Apply the point, diagnose it, and undo everything. Sound slices only:
/// every point inside a returned slice is invalid.
pub(crate) fn test_point(
    p: &mut Pos,
    arena: &mut Arena,
    u: &Universe,
    hc: &Hypercuboid,
    point: &[usize],
) -> Problem {
    #[derive(Clone, Copy, PartialEq)]
    enum Want {
        Phys,
        Push,
        Branch,
    }
    //Gather the moves to apply with their designation
    let mut todo: Vec<(usize, Want, Mv)> = Vec::new();
    for (a, &id) in point.iter().enumerate() {
        match u.axes[a].sms[id] {
            Sm::Physical(i) => todo.push((a, Want::Phys, u.moves[i as usize])),
            Sm::Arrival(i) => todo.push((a, Want::Push, u.moves[i as usize])),
            Sm::Branch(i) => todo.push((a, Want::Branch, u.moves[i as usize])),
            Sm::Null | Sm::Departure(_) => {}
        }
    }

    let mut undos: Vec<crate::Undo> = Vec::new();
    let mut owner = BoardOwner { map: Vec::new() };
    let mut done = vec![false; todo.len()];
    let mut n_done = 0;
    let slice_sizes: Vec<usize> = u.axes.iter().map(|a| a.sms.len()).collect();
    let cleanup = |p: &mut Pos, arena: &mut Arena, undos: &mut Vec<crate::Undo>| {
        while let Some(op) = undos.pop() {
            undo(p, arena, op);
        }
    };

    while n_done < todo.len() {
        let mut progressed = false;
        for ti in 0..todo.len() {
            if done[ti] {
                continue;
            }
            let (axis, want, m) = todo[ti];
            let src_latest = p.tls[m.s.l as usize].as_ref().map(|tl| (tl.len() - 1) as i32);
            if src_latest != Some(m.s.t) {
                continue; //source not ready (or consumed: then we stall below)
            }
            let dest_latest = p.tls[m.d.l as usize].as_ref().map(|tl| (tl.len() - 1) as i32);
            let ok = match want {
                Want::Phys => true,
                Want::Push => dest_latest == Some(m.d.t),
                Want::Branch => dest_latest != Some(m.d.t),
            };
            if !ok {
                continue;
            }
            let op = apply(p, arena, &m);
            //record who owns the boards this apply created
            owner.map.push((m.s.l, m.s.t + 1, axis));
            match want {
                Want::Phys => {}
                Want::Push => {
                    let dest_axis = u
                        .axes
                        .iter()
                        .position(|ax| ax.tl == Some(m.d.l as usize))
                        .unwrap_or(axis);
                    owner.map.push((m.d.l, m.d.t + 1, dest_axis));
                }
                Want::Branch => {
                    //the new timeline's only board belongs to the new axis
                    if let crate::Op::NewTl { slot, .. } = op.a {
                        owner.map.push((slot as i32, m.d.t + 1, axis));
                    }
                }
            }
            undos.push(op);
            done[ti] = true;
            n_done += 1;
            progressed = true;
        }
        if !progressed {
            //Stuck. The classic case: a Branch designated at a playable board
            //that stays latest because its own axis chose Null.
            for ti in 0..todo.len() {
                if done[ti] {
                    continue;
                }
                let (axis, want, m) = todo[ti];
                if want == Want::Branch {
                    if let Some(b_axis) = u.axes.iter().position(|ax| ax.tl == Some(m.d.l as usize)) {
                        if matches!(u.axes[b_axis].sms[point[b_axis]], Sm::Null) {
                            let mut restr: Vec<Option<AxisSet>> = vec![None; u.axes.len()];
                            let mut sb = AxisSet::empty(slice_sizes[b_axis]);
                            sb.insert(point[b_axis]);
                            restr[b_axis] = Some(sb);
                            let mut sa = AxisSet::empty(slice_sizes[axis]);
                            sa.insert(point[axis]);
                            restr[axis] = Some(sa);
                            cleanup(p, arena, &mut undos);
                            return Problem::Slice(Slice { restr }, false);
                        }
                    }
                }
            }
            //Unknown conflict: banish exactly this point
            cleanup(p, arena, &mut undos);
            return Problem::Slice(point_slice(point, &slice_sizes), false);
        }
    }

    //Present test: did the action advance the present?
    let mut present: Vec<usize> = Vec::new();
    present_timelines(p, &mut present);
    if !present.is_empty() {
        //The failing pass sits exactly at the universe's present: mid-action
        //the mover-parity minimum never rises (old boards persist), so
        //present[0]'s endpoint is u.present_t and its axis chose Null.
        let b_l = present[0];
        let b_axis = u.axis_of_tl[b_l].expect("present board is playable");
        //b either sat at the present when the universe was built, or it is a
        //savior this point's branching reactivated (then its pass only exists
        //because of the branches, and the slice must require them).
        let b_at_build = u.axes[b_axis].present;
        let mut restr: Vec<Option<AxisSet>> = vec![None; u.axes.len()];
        let mut sb = AxisSet::empty(slice_sizes[b_axis]);
        sb.insert(point[b_axis]);
        restr[b_axis] = Some(sb);
        //Branching can reactivate a savior line (top board awaits the mover
        //below the present): left unmoved it realizes the lowered present and
        //the action still fails, so pin every savior to Null. (A point that
        //moved a savior falls out of the slice; ensure_contains handles it.)
        let mut floor = u.clear_floor;
        let mut k0_b: usize = 0;
        for &(sa, k0, top) in &u.saviors {
            if sa == b_axis {
                k0_b = k0;
                floor = floor.min(top);
                continue;
            }
            let null_id = (0..slice_sizes[sa])
                .find(|&id| matches!(u.axes[sa].sms[id], Sm::Null))
                .expect("playable axes always hold Null");
            let mut s = AxisSet::empty(slice_sizes[sa]);
            s.insert(null_id);
            restr[sa] = Some(s);
        }
        //Reactivated pass: pin enough new axes to branches to guarantee b is
        //reactivated in every slice point (under the hammer: to this point's
        //exact branches, since extra branches could reach a hammer line).
        let mut need = if b_at_build { 0 } else { k0_b.max(1) };
        if !b_at_build {
            for (a, axis) in u.axes.iter().enumerate() {
                if need == 0 {
                    break;
                }
                if axis.tl.is_some() || !matches!(axis.sms[point[a]], Sm::Branch(_)) {
                    continue;
                }
                let mut s = AxisSet::empty(slice_sizes[a]);
                if u.react_hammer {
                    s.insert(point[a]);
                } else {
                    for id in 0..slice_sizes[a] {
                        if let Sm::Branch(i) = axis.sms[id] {
                            if u.moves[i as usize].d.t + 1 >= floor {
                                s.insert(id);
                            }
                        }
                    }
                }
                restr[a] = Some(s);
                need -= 1;
            }
        }
        if need > 0 {
            //cannot witness the reactivation: banish exactly this point
            cleanup(p, arena, &mut undos);
            return Problem::Slice(point_slice(point, &slice_sizes), false);
        }
        //Only a branch can save a pass at the present: physical moves and
        //arrivals advance endpoints and never lower it. A branch is excluded
        //from the slice when it could create an ACTIVE timeline below the
        //floor (the present, lowered to the reachable saviors' tops - those
        //ride pinned and still fail), or - react_hammer - when branching
        //could reactivate a stale timeline that empties the present with no
        //pinnable witness. Inactive branches ride: they cannot touch the
        //present.
        for (a, axis) in u.axes.iter().enumerate() {
            if axis.tl.is_some() || restr[a].is_some() {
                continue; //branches live on unpinned new-timeline axes only
            }
            let mut s = AxisSet::empty(slice_sizes[a]);
            let mut restricted = false;
            for id in 0..slice_sizes[a] {
                let keep_out = match axis.sms[id] {
                    Sm::Branch(i) => {
                        u.react_hammer
                            || (u.first_new_slot_active
                                && u.moves[i as usize].d.t + 1 < floor)
                    }
                    _ => false,
                };
                if keep_out {
                    restricted = true;
                } else {
                    s.insert(id);
                }
            }
            if restricted {
                restr[a] = Some(s);
            }
        }
        cleanup(p, arena, &mut undos);
        PRESENT_SLICES.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        //Universe-global: the argument reads only the move table and the
        //pre-action activity facts, never this hypercuboid.
        let slice = Slice { restr };
        return Problem::Slice(ensure_contains(slice, point, &slice_sizes), true);
    }

    //Check test
    let mut list: Vec<(P4, P4)> = Vec::new();
    checks(p, arena, false, &mut list, &present);
    if list.is_empty() {
        let action: Vec<Mv> = todo.iter().map(|&(_, _, m)| m).collect();
        cleanup(p, arena, &mut undos);
        return Problem::Legal(action);
    }
    //Any surviving check soundly bans its slice; prefer the one whose boards
    //avoid action-created timeline slots (those freeze every branch axis) and
    //need the fewest exact pins - it removes the fattest region.
    let (att, king) = *list
        .iter()
        .min_by_key(|&&(att, king)| {
            //spatial check inside a branch-created board: codim-1 slice
            if att.l == king.l && att.t == king.t {
                if let Some(a) = owner.get(att.l, att.t) {
                    if u.axes[a].tl.is_none() {
                        return 0u32;
                    }
                }
            }
            let mut cost = 1u32;
            let mut probe = |b: P4| {
                if let Some(a) = owner.get(b.l, b.t) {
                    cost += if u.axes[a].tl.is_none() { 1000 } else { 1 };
                }
            };
            probe(att);
            probe(king);
            if let Some((lm, tm, rm, fm, steps)) = ray_vec(p, att, king) {
                let mut cur = att;
                for _ in 1..steps {
                    cur = P4 {
                        l: if lm == 0 { cur.l } else { timeline_move(cur.l, lm, p.is_even) },
                        t: cur.t + tm,
                        r: cur.r + rm,
                        f: cur.f + fm,
                    };
                    if pos_exists(p, cur) {
                        probe(cur);
                    }
                }
            }
            cost
        })
        .unwrap();
    let slice = check_slice(p, arena, u, hc, point, &owner, att, king, &slice_sizes);
    cleanup(p, arena, &mut undos);
    CHECK_SLICES.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    Problem::Slice(ensure_contains(slice, point, &slice_sizes), true)
}

fn point_slice(point: &[usize], sizes: &[usize]) -> Slice {
    Slice {
        restr: point
            .iter()
            .zip(sizes)
            .map(|(&id, &n)| {
                let mut s = AxisSet::empty(n);
                s.insert(id);
                Some(s)
            })
            .collect(),
    }
}

/// Slices must contain the point they were derived from, or the search could
/// loop. When a conservative exclusion dropped the point itself, fall back to
/// banishing exactly the point.
fn ensure_contains(slice: Slice, point: &[usize], sizes: &[usize]) -> Slice {
    let inside = slice.restr.iter().enumerate().all(|(a, r)| match r {
        None => true,
        Some(s) => s.contains(point[a]),
    });
    if inside {
        slice
    } else {
        point_slice(point, sizes)
    }
}

/// The check `att -> king` survives for every point that keeps the involved
/// boards identical and neither blocks the path, captures the checker, nor
/// interferes at the king's square. Checks are pure endpoint geometry here:
/// attacks are read from post-action endpoint boards, past royals are
/// historical targets, and activation/present never enter the predicate - so
/// branch variations ride in the slice freely, UNLESS the check itself
/// involves a board on an action-created timeline slot (then slot assignment
/// depends on the whole branch profile and every new axis is frozen).
fn check_slice(
    p: &Pos,
    arena: &crate::Arena,
    u: &Universe,
    hc: &Hypercuboid,
    point: &[usize],
    owner: &BoardOwner,
    att: P4,
    king: P4,
    sizes: &[usize],
) -> Slice {
    let n = u.axes.len();
    //Spatial check inside a branch-created board: the board is the (immutable)
    //destination plus the landing piece, so the check is intrinsic to the
    //branch MOVE and independent of slot assignment and every other axis -
    //ban the branch on this axis alone (codim 1, propagates everywhere).
    if att.l == king.l && att.t == king.t {
        if let Some(a) = owner.get(att.l, att.t) {
            if u.axes[a].tl.is_none() {
                let mut restr: Vec<Option<AxisSet>> = vec![None; n];
                let mut s = AxisSet::empty(sizes[a]);
                s.insert(point[a]);
                restr[a] = Some(s);
                let _ = hc;
                INTRINSIC_SLICES.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                return Slice { restr };
            }
        }
    }
    let mut exact: Vec<bool> = vec![false; n];
    //New axes whose created board the check is read through. Branch slots are
    //assigned in new-axis order (the apply loop clears all branches in its
    //first pass), so a board on slot X stays on slot X exactly when the
    //involved branches and the branch/null STATUS of the new axes below them
    //are preserved; new axes above the highest involved one stay free.
    let mut new_involved: Vec<usize> = Vec::new();
    for b in [att, king] {
        if let Some(a) = owner.get(b.l, b.t) {
            exact[a] = true;
            if u.axes[a].tl.is_none() && !new_involved.contains(&a) {
                new_involved.push(a);
            }
        }
    }

    //Crossing squares of the checking ray on boards the action produced.
    //`vacated`: the square held a piece on the board below (the action's move
    //vacated it to open the ray) - sibling semimoves that do NOT depart that
    //square leave the ray blocked, so only departures from it may ride.
    let mut crossing: Vec<(usize, i32, i32, bool)> = Vec::new(); //(axis, r, f, vacated)
    if let Some((lm, tm, rm, fm, steps)) = ray_vec(p, att, king) {
        let mut cur = att;
        for _ in 1..steps {
            cur = P4 {
                l: if lm == 0 { cur.l } else { timeline_move(cur.l, lm, p.is_even) },
                t: cur.t + tm,
                r: cur.r + rm,
                f: cur.f + fm,
            };
            if !pos_exists(p, cur) {
                continue;
            }
            if let Some(a) = owner.get(cur.l, cur.t) {
                if u.axes[a].tl.is_none() {
                    //ray passes through a new slot's board: pin that branch
                    exact[a] = true;
                    if !new_involved.contains(&a) {
                        new_involved.push(a);
                    }
                } else if !exact[a] {
                    let below = P4 { l: cur.l, t: cur.t - 1, r: cur.r, f: cur.f };
                    let vacated = pos_exists(p, below) && piece_at(p, arena, below) != 0;
                    crossing.push((a, cur.r, cur.f, vacated));
                }
            }
        }
    }
    //Below the highest involved new axis, only the branch/null status of the
    //other new axes matters (it fixes the involved branches' slot ranks).
    if !new_involved.is_empty() {
        NEWINV_SLICES.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    }
    let mut status_pin: Vec<bool> = vec![false; n];
    if let Some(&jmax) = new_involved.iter().max() {
        for (a, axis) in u.axes.iter().enumerate() {
            if a < jmax && axis.tl.is_none() && !exact[a] {
                status_pin[a] = true;
            }
        }
    }

    let mut restr: Vec<Option<AxisSet>> = vec![None; n];
    for a in 0..n {
        if exact[a] {
            let mut s = AxisSet::empty(sizes[a]);
            s.insert(point[a]);
            restr[a] = Some(s);
            continue;
        }
        if status_pin[a] {
            //keep this new axis on the point's side of the branch/null split
            let mut s = AxisSet::empty(sizes[a]);
            if matches!(u.axes[a].sms[point[a]], Sm::Null) {
                s.insert(point[a]);
            } else {
                for id in 0..sizes[a] {
                    if matches!(u.axes[a].sms[id], Sm::Branch(_)) {
                        s.insert(id);
                    }
                }
            }
            restr[a] = Some(s);
            continue;
        }
        let mut s = AxisSet::empty(sizes[a]);
        let mut restricted = false;
        for id in 0..sizes[a] {
            let on_crossing = crossing.iter().any(|&(ca, _, _, _)| ca == a);
            let keep_out = match u.axes[a].sms[id] {
                //a branch only touches a new slot (frozen above when the
                //check involves one) and its departed square is fixed by the
                //pinned source axis: it cannot alter this check
                Sm::Branch(_) => false,
                Sm::Physical(i) => {
                    let m = &u.moves[i as usize];
                    //anything that rewrites the attacker's or the king's
                    //timeline can change which board the check is read from
                    m.d.l == att.l || m.d.l == king.l
                        || crossing.iter().any(|&(ca, cr, cf, vac)| {
                            ca == a
                                //blocks the path on this axis's board, or
                                //fails to vacate a square the ray needs open
                                && ((m.d.r == cr && m.d.f == cf)
                                    || (vac && !(m.s.r == cr && m.s.f == cf)))
                        })
                        //castle/en-passant touch extra squares the d-filter
                        //cannot see: keep them out wholesale
                        || !matches!(m.extra, crate::Extra::None)
                }
                Sm::Arrival(i) => {
                    let m = &u.moves[i as usize];
                    //an arrival never vacates squares on its landing board
                    m.d.l == att.l || m.d.l == king.l
                        || crossing.iter().any(|&(ca, cr, cf, vac)| {
                            ca == a && ((m.d.r == cr && m.d.f == cf) || vac)
                        })
                        || !matches!(m.extra, crate::Extra::None)
                }
                Sm::Departure(d) => {
                    //a departure removes a piece (cannot close the checking
                    //path) and its landing is filtered on the arrival's axis —
                    //but it still pushes a new board on ITS timeline, which
                    //matters for the attacker's or king's timeline, and it
                    //must be THE departure when the ray needs its square open
                    d.l == att.l || d.l == king.l
                        || crossing.iter().any(|&(ca, cr, cf, vac)| {
                            ca == a && vac && !(d.r == cr && d.f == cf)
                        })
                }
                //the checking ray was read through a board this axis's chosen
                //semimove created; a sibling that does not create it may break
                //the ray, so Null cannot ride in the slice on crossing axes
                Sm::Null => on_crossing,
            };
            if keep_out {
                restricted = true;
            } else {
                s.insert(id);
            }
        }
        //The chosen semimove must ride in its own slice; when the filter
        //would exclude it (e.g. the point's own branch), pin the axis to
        //exactly the choice instead of falling back to a one-point slice.
        if restricted && !s.contains(point[a]) {
            s = AxisSet::empty(sizes[a]);
            s.insert(point[a]);
        }
        if restricted {
            restr[a] = Some(s);
        }
    }
    //hc is only used to size diagnostics today
    let _ = hc;
    Slice { restr }
}

//=== Search ===================================================================

#[derive(Default)]
pub struct HcStats {
    pub iters: u64,
    pub max_space: usize,
    pub axes: usize,
    pub volume_log2: f64,
    pub slices: u64,
    pub propagated: u64,
    pub t_take_ms: f64,
    pub t_test_ms: f64,
    pub t_slice_ms: f64,
    pub no_point: u64,
    pub codim_sum: u64,
    pub global_slices: u64,
}

#[cfg(not(target_arch = "wasm32"))]
macro_rules! hc_timed {
    ($slot:expr, $e:expr) => {{
        let __t = std::time::Instant::now();
        let __r = $e;
        $slot += __t.elapsed().as_secs_f64() * 1000.0;
        __r
    }};
}
#[cfg(target_arch = "wasm32")]
macro_rules! hc_timed {
    ($slot:expr, $e:expr) => {{ let _ = &$slot; $e }};
}

/// Global slices with at most this codimension propagate across the space.
#[cfg(not(target_arch = "wasm32"))]
fn prop_codim() -> usize {
    std::env::var("HC_PROP_CODIM").ok().and_then(|v| v.parse().ok()).unwrap_or(PROP_CODIM)
}
/// Measured on the zy monster: gate 1 times out (every region rediscovered
/// per hypercuboid), gate 6 over-splits the space; 3 proves it fastest.
const PROP_CODIM: usize = 3;

/// Hypercuboid legal-action search: YES / NO / TIMEOUT. `deadline` in ms epoch.
pub(crate) fn has_legal_hc(p: &mut Pos, arena: &mut Arena, deadline: f64, st: &mut HcStats) -> u8 {
    let mut present0: Vec<usize> = Vec::new();
    present_timelines(p, &mut present0);
    if present0.is_empty() {
        let mut list: Vec<(P4, P4)> = Vec::new();
        checks(p, arena, false, &mut list, &present0);
        return if list.is_empty() { YES } else { NO };
    }
    let u = build_universe(p, arena);
    #[cfg(not(target_arch = "wasm32"))]
    let prop_gate = prop_codim();
    #[cfg(target_arch = "wasm32")]
    let prop_gate = PROP_CODIM;
    let mut space: Vec<Hypercuboid> = vec![full_hypercuboid(&u)];
    st.axes = u.axes.len();
    st.volume_log2 = space[0].volume_log2();
    while let Some(hc) = space.pop() {
        if hc.is_empty() {
            continue;
        }
        st.iters += 1;
        if st.iters % 64 == 0 && now_ms() > deadline {
            return TIMEOUT;
        }
        let point = match hc_timed!(st.t_take_ms, take_point(&u, &hc)) {
            Some(pt) => pt,
            None => {
                st.no_point += 1;
                continue; //no consistent point lives in this hypercuboid
            }
        };
        match hc_timed!(st.t_test_ms, test_point(p, arena, &u, &hc, &point)) {
            Problem::Legal(_action) => return YES,
            Problem::Slice(slice, global) => {
                st.slices += 1;
                st.codim_sum += slice.codim() as u64;
                if global {
                    st.global_slices += 1;
                }
                hc_timed!(st.t_slice_ms, {
                    //A codim-1 slice removes cleanly (at most one piece per
                    //hypercuboid): propagate it through the whole space so the
                    //same invalid region is never rediscovered piecemeal - but
                    //ONLY slices whose soundness is universe-global (today:
                    //the deferral slices that carry the travel-mate proofs).
                    if global && slice.codim() <= prop_gate {
                        let mut kept: Vec<Hypercuboid> = Vec::with_capacity(space.len() + 1);
                        for other in space.drain(..) {
                            if slice.intersects(&other) {
                                st.propagated += 1;
                                kept.extend(remove_slice(&other, &slice));
                            } else {
                                kept.push(other);
                            }
                        }
                        space = kept;
                    }
                    space.extend(remove_slice(&hc, &slice));
                });
                st.max_space = st.max_space.max(space.len());
            }
        }
    }
    NO
}

#[cfg(not(target_arch = "wasm32"))]
pub fn profile_has_legal_hc(buf: &[i32], budget_ms: f64) {
    let (mut p, mut arena) = crate::parse(buf);
    let t0 = std::time::Instant::now();
    let mut st = HcStats::default();
    let r = has_legal_hc(&mut p, &mut arena, now_ms() + budget_ms, &mut st);
    println!(
        "hc_has_legal = {} ({}) in {:.3}s | axes {} vol 2^{:.0} | iters {} slices {} (global {} avg codim {:.1}) no_point {} propagated {} max_space {} | take {:.0}ms test {:.0}ms slice {:.0}ms | arena boards {}",
        r as i32,
        ["YES", "NO", "TIMEOUT"][r as usize],
        t0.elapsed().as_secs_f64(),
        st.axes,
        st.volume_log2,
        st.iters,
        st.slices,
        st.global_slices,
        st.codim_sum as f64 / st.slices.max(1) as f64,
        st.no_point,
        st.propagated,
        st.max_space,
        st.t_take_ms,
        st.t_test_ms,
        st.t_slice_ms,
        arena.boards.len(),
    );
    println!(
        "  present_slices {} check_slices {} (intrinsic {} new_involved {})",
        PRESENT_SLICES.load(std::sync::atomic::Ordering::Relaxed),
        CHECK_SLICES.load(std::sync::atomic::Ordering::Relaxed),
        INTRINSIC_SLICES.load(std::sync::atomic::Ordering::Relaxed),
        NEWINV_SLICES.load(std::sync::atomic::Ordering::Relaxed),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hc(axes: &[&[usize]], sizes: &[usize]) -> Hypercuboid {
        Hypercuboid {
            axes: axes.iter().zip(sizes).map(|(ids, &n)| {
                let mut s = AxisSet::empty(n);
                for &i in *ids { s.insert(i); }
                s
            }).collect(),
        }
    }

    #[test]
    fn slice_removal_codim1() {
        // doc example: axis2 {f,g,h} minus {g,h} -> one hypercuboid
        let h = hc(&[&[0, 1, 2], &[0, 1], &[0, 1, 2]], &[3, 2, 3]);
        let mut s2 = AxisSet::empty(3);
        s2.insert(1);
        s2.insert(2);
        let slice = Slice { restr: vec![None, None, Some(s2)] };
        let out = remove_slice(&h, &slice);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].axes[2].iter().collect::<Vec<_>>(), vec![0]);
        assert_eq!(out[0].axes[0].count(), 3);
    }

    #[test]
    fn slice_removal_codim2_splits() {
        // doc example: banish (a on axis0) x (d on axis1) -> two pieces
        let h = hc(&[&[0, 1, 2], &[0, 1], &[0, 1, 2]], &[3, 2, 3]);
        let slice = Slice::point(&[0, 0], &[3, 2]);
        let slice = Slice { restr: vec![slice.restr[0].clone(), slice.restr[1].clone(), None] };
        let out = remove_slice(&h, &slice);
        assert_eq!(out.len(), 2);
        let total: usize = out.iter().map(|h| h.axes.iter().map(|a| a.count()).product::<usize>()).sum();
        assert_eq!(total, 18 - 3); // 18 points minus the 1x1x3 line
        // pieces are disjoint: one lacks a on axis0, the other has only a + e
        assert!(out.iter().any(|p| !p.axes[0].contains(0)));
        assert!(out.iter().any(|p| p.axes[0].iter().collect::<Vec<_>>() == vec![0] && p.axes[1].iter().collect::<Vec<_>>() == vec![1]));
    }

    #[test]
    fn slice_disjoint_returns_clone() {
        let h = hc(&[&[0], &[1]], &[2, 2]);
        let slice = Slice::point(&[1, 0], &[2, 2]);
        let out = remove_slice(&h, &slice);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].axes[0].iter().collect::<Vec<_>>(), vec![0]);
    }

    #[test]
    fn matching_simple_pair() {
        // 0-1 required both: match them
        let adj = vec![vec![1], vec![0]];
        let m = find_matching(&adj, &[true, true]).unwrap();
        assert_eq!(m[0], 1);
        assert_eq!(m[1], 0);
    }

    #[test]
    fn matching_impossible() {
        // star: 1,2,3 all required, all only connect to 0
        let adj = vec![vec![1, 2, 3], vec![0], vec![0], vec![0]];
        assert!(find_matching(&adj, &[false, true, true, true]).is_none());
    }

    #[test]
    fn matching_augments_through_matched_edge() {
        // path 0-1-2-3, required {0,3}: needs 0-1 and 2-3
        let adj = vec![vec![1], vec![0, 2], vec![1, 3], vec![2]];
        let m = find_matching(&adj, &[true, false, false, true]).unwrap();
        assert_eq!(m[0], 1);
        assert_eq!(m[3], 2);
    }

    #[test]
    fn matching_blossom() {
        // odd cycle 0-1-2-0 with a tail 2-3; required {0,1,3}
        let adj = vec![vec![1, 2], vec![0, 2], vec![0, 1, 3], vec![2]];
        let m = find_matching(&adj, &[true, true, false, true]).unwrap();
        assert_eq!(m[0], 1);
        assert_eq!(m[1], 0);
        assert_eq!(m[2], 3);
    }

    #[test]
    fn matching_even_path_leaves_optional_vertex() {
        // 0 required, 1 optional and matched to 2; 0-1 edge should steal 1
        let adj = vec![vec![1], vec![0, 2], vec![1]];
        let m = find_matching(&adj, &[true, false, false]).unwrap();
        assert_eq!(m[0], 1);
    }

    #[test]
    fn matching_larger_blossom_shift() {
        // Two triangles joined: 0-1-2-0, 2-3, 3-4-5-3; required {0,1,4,5}
        let adj = vec![
            vec![1, 2], vec![0, 2], vec![0, 1, 3],
            vec![2, 4, 5], vec![3, 5], vec![3, 4],
        ];
        let m = find_matching(&adj, &[true, true, false, false, true, true]).unwrap();
        assert_eq!(m[0], 1);
        assert_eq!(m[4], 5);
    }
}
