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
    loop {
        let root = match (0..n).find(|&v| required[v] && mate[v] == NONE) {
            Some(v) => v,
            None => return Some(mate),
        };
        // BFS with blossom contraction from `root`
        let mut parent = vec![NONE; n];
        let mut base: Vec<usize> = (0..n).collect();
        let mut even = vec![false; n];
        let mut in_queue = vec![false; n];
        let mut queue = std::collections::VecDeque::new();
        even[root] = true;
        in_queue[root] = true;
        queue.push_back(root);
        let mut augment_end = NONE;

        // walk to the root collecting the alternating path, flipping matches
        let augment = |mate: &mut Vec<usize>, parent: &Vec<usize>, mut v: usize| {
            while v != NONE {
                let pv = parent[v];
                let next = if pv == NONE { NONE } else { mate[pv] };
                mate[v] = pv;
                if pv != NONE { mate[pv] = v; }
                v = next;
            }
        };
        let lca = |base: &Vec<usize>, parent: &Vec<usize>, mate: &Vec<usize>, mut a: usize, mut b: usize| {
            let mut seen = vec![];
            let mut mark = std::collections::HashSet::new();
            loop {
                a = base[a];
                mark.insert(a);
                seen.push(a);
                if mate[a] == NONE || parent[mate[a]] == NONE { break; }
                a = parent[mate[a]];
            }
            loop {
                b = base[b];
                if mark.contains(&b) { return b; }
                if mate[b] == NONE || parent[mate[b]] == NONE {
                    // fall back: root is common ancestor
                    return *seen.last().unwrap();
                }
                b = parent[mate[b]];
            }
        };
        // mark blossom path from v up to the base, re-rooting parents
        let mark_path = |base: &mut Vec<usize>, parent: &mut Vec<usize>,
                         queue: &mut std::collections::VecDeque<usize>,
                         in_queue: &mut Vec<bool>, even: &mut Vec<bool>,
                         mate: &Vec<usize>, mut v: usize, b: usize, mut child: usize| {
            while base[v] != b {
                let mv = mate[v];
                // v (odd) and its mate join the blossom; both become even-reachable
                parent[v] = child;
                base[v] = b;
                base[mv] = b;
                if !even[mv] {
                    even[mv] = true;
                }
                if !even[v] { even[v] = true; }
                if !in_queue[mv] { in_queue[mv] = true; queue.push_back(mv); }
                if !in_queue[v] { in_queue[v] = true; queue.push_back(v); }
                child = mv;
                v = if parent[mv] == NONE { b } else { parent[mv] };
            }
        };

        'bfs: while let Some(v) = queue.pop_front() {
            for &u in &adj[v] {
                if base[u] == base[v] || mate[v] == u { continue; }
                if even[u] {
                    // blossom: contract around the common ancestor
                    let b = lca(&base, &parent, &mate, v, u);
                    mark_path(&mut base, &mut parent, &mut queue, &mut in_queue, &mut even, &mate, v, b, u);
                    mark_path(&mut base, &mut parent, &mut queue, &mut in_queue, &mut even, &mate, u, b, v);
                }
                else if parent[u] == NONE {
                    parent[u] = v;
                    if mate[u] == NONE {
                        // odd-length augmenting path: u is free
                        augment_end = u;
                        break 'bfs;
                    }
                    let w = mate[u];
                    if !required[w] {
                        // even-length augmenting path: w need not be covered.
                        // Flip matches along root..u, leaving w unmatched.
                        augment_end = u;
                        break 'bfs;
                    }
                    even[w] = true;
                    if !in_queue[w] { in_queue[w] = true; queue.push_back(w); }
                }
            }
        }
        if augment_end == NONE { return None; }
        augment(&mut mate, &parent, augment_end);
    }
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
