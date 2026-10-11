//open5dchess v3 engine: the legal-move search of shared/legalMoves.js rewritten
//in Rust, compiled to WebAssembly. Move SEMANTICS are a line-by-line port of the
//vendored upstream code in shared/engine/{board,piece}.js (including its quirks:
//the positionIsAttacked fall-throughs, verbatim table orders, the exact new-
//timeline index arithmetic). What v3 changes is the machinery:
//  - boards live in an arena of flat [i8; 64] arrays (8x8 only)
//  - search uses apply/undo instead of clone-per-node
//  - per-board content hashes and spatial check scans are cached by arena index
//  - the whole DFS (classifyMoves / hasLegalAction) runs inside WASM; JS
//    marshals the position once per call
//Input/output contract matches shared/legalMoves.js exactly; differential
//tests in server/test/v3Engine.test.js enforce it on the full game corpus.
#![allow(clippy::needless_range_loop)]

use std::collections::HashSet;
use std::hash::{BuildHasherDefault, Hasher};
use std::rc::Rc;

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
extern "C" {
    fn now() -> f64; //Date.now() from the host
}
#[cfg(target_arch = "wasm32")]
fn now_ms() -> f64 {
    unsafe { now() }
}
#[cfg(not(target_arch = "wasm32"))]
fn now_ms() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs_f64() * 1000.0
}

//Native profiling entry (cargo run --bin profile <file.bin> [reps]): runs
//classify on a serialized position dumped by the JS wrapper.
#[cfg(not(target_arch = "wasm32"))]
pub fn profile_has_legal(buf: &[i32], budget_ms: f64) {
    let (mut p, mut arena) = parse(buf);
    let mut ctx = Ctx::new(now_ms() + budget_ms);
    let h = pos_hash(&p, &mut arena);
    let t0 = std::time::Instant::now();
    let r = can_complete(&mut p, &mut arena, &mut ctx, 0, h);
    use std::sync::atomic::Ordering::Relaxed;
    let ms = |v: &std::sync::atomic::AtomicU64| v.load(Relaxed) as f64 / 1e6;
    println!(
        "has_legal = {} ({}) in {:.1}s | arena boards {} | nodes {} edges {} | present {:.1}ms checks {:.1}ms gen {:.1}ms step {:.1}ms",
        r as i32,
        ["YES", "NO", "TIMEOUT"][r as usize],
        t0.elapsed().as_secs_f64(),
        arena.boards.len(),
        stats::NODES.load(Relaxed),
        stats::EDGES.load(Relaxed),
        ms(&stats::T_PRESENT),
        ms(&stats::T_CHECKS),
        ms(&stats::T_GEN),
        ms(&stats::T_STEP),
    );
}

#[cfg(not(target_arch = "wasm32"))]
pub fn profile_classify(buf: &[i32], reps: usize) {
    for _ in 0..reps {
        let (mut p, mut arena) = parse(buf);
        let mut root_moves: Vec<Mv> = Vec::new();
        gen_moves(&p, &mut arena, &mut root_moves);
        let mut ctx = Ctx::new(0.0);
        let mut counts = [0usize; 3];
        for mv in &root_moves {
            let u = apply(&mut p, &mut arena, mv);
            ctx.deadline = now_ms() + 120000.0;
            let h = pos_hash(&p, &mut arena);
            let r = search_root(&mut p, &mut arena, &mut ctx, h);
            undo(&mut p, &mut arena, u);
            counts[r as usize] += 1;
        }
        std::hint::black_box(counts);
    }
    use std::sync::atomic::Ordering::Relaxed;
    let ms = |v: &std::sync::atomic::AtomicU64| v.load(Relaxed) as f64 / 1e6;
    println!(
        "nodes {} edges {} | present {:.1}ms checks {:.1}ms gen {:.1}ms step {:.1}ms",
        stats::NODES.load(Relaxed),
        stats::EDGES.load(Relaxed),
        ms(&stats::T_PRESENT),
        ms(&stats::T_CHECKS),
        ms(&stats::T_GEN),
        ms(&stats::T_STEP)
    );
}

//=== move tables, verbatim from shared/engine/piece.js ========================
type V4 = [i8; 4];
const KNIGHT_POS: [V4; 48] = [
    [0, 0, 1, 2], [0, 0, 1, -2], [0, 0, -1, 2], [0, 0, -1, -2],
    [0, 0, 2, 1], [0, 0, 2, -1], [0, 0, -2, 1], [0, 0, -2, -1],
    [0, 1, 0, 2], [0, 1, 0, -2], [0, -1, 0, 2], [0, -1, 0, -2],
    [0, 2, 0, 1], [0, 2, 0, -1], [0, -2, 0, 1], [0, -2, 0, -1],
    [0, 1, 2, 0], [0, 1, -2, 0], [0, -1, 2, 0], [0, -1, -2, 0],
    [0, 2, 1, 0], [0, 2, -1, 0], [0, -2, 1, 0], [0, -2, -1, 0],
    [1, 0, 0, 2], [1, 0, 0, -2], [-1, 0, 0, 2], [-1, 0, 0, -2],
    [2, 0, 0, 1], [2, 0, 0, -1], [-2, 0, 0, 1], [-2, 0, 0, -1],
    [1, 0, 2, 0], [1, 0, -2, 0], [-1, 0, 2, 0], [-1, 0, -2, 0],
    [2, 0, 1, 0], [2, 0, -1, 0], [-2, 0, 1, 0], [-2, 0, -1, 0],
    [1, 2, 0, 0], [1, -2, 0, 0], [-1, 2, 0, 0], [-1, -2, 0, 0],
    [2, 1, 0, 0], [2, -1, 0, 0], [-2, 1, 0, 0], [-2, -1, 0, 0],
];
const KING_POS: [V4; 80] = [
    [0, 0, 0, 1], [0, 0, 0, -1],
    [0, 0, 1, 0], [0, 0, -1, 0],
    [0, 0, 1, 1], [0, 0, 1, -1], [0, 0, -1, 1], [0, 0, -1, -1],
    [0, 1, 0, 0], [0, -1, 0, 0],
    [0, 1, 0, 1], [0, 1, 0, -1], [0, -1, 0, 1], [0, -1, 0, -1],
    [0, 1, 1, 0], [0, 1, -1, 0], [0, -1, 1, 0], [0, -1, -1, 0],
    [0, 1, 1, 1], [0, 1, 1, -1], [0, 1, -1, 1], [0, 1, -1, -1],
    [0, -1, 1, 1], [0, -1, 1, -1], [0, -1, -1, 1], [0, -1, -1, -1],
    [1, 0, 0, 0], [-1, 0, 0, 0],
    [1, 0, 0, 1], [1, 0, 0, -1], [-1, 0, 0, 1], [-1, 0, 0, -1],
    [1, 0, 1, 0], [1, 0, -1, 0], [-1, 0, 1, 0], [-1, 0, -1, 0],
    [1, 0, 1, 1], [1, 0, 1, -1], [1, 0, -1, 1], [1, 0, -1, -1],
    [-1, 0, 1, 1], [-1, 0, 1, -1], [-1, 0, -1, 1], [-1, 0, -1, -1],
    [1, 1, 0, 0], [1, -1, 0, 0], [-1, 1, 0, 0], [-1, -1, 0, 0],
    [1, 1, 0, 1], [1, 1, 0, -1], [1, -1, 0, 1], [1, -1, 0, -1],
    [-1, 1, 0, 1], [-1, 1, 0, -1], [-1, -1, 0, 1], [-1, -1, 0, -1],
    [1, 1, 1, 0], [1, 1, -1, 0], [1, -1, 1, 0], [1, -1, -1, 0],
    [-1, 1, 1, 0], [-1, 1, -1, 0], [-1, -1, 1, 0], [-1, -1, -1, 0],
    [1, 1, 1, 1], [1, 1, 1, -1], [1, 1, -1, 1], [1, 1, -1, -1],
    [1, -1, 1, 1], [1, -1, 1, -1], [1, -1, -1, 1], [1, -1, -1, -1],
    [-1, 1, 1, 1], [-1, 1, 1, -1], [-1, 1, -1, 1], [-1, 1, -1, -1],
    [-1, -1, 1, 1], [-1, -1, 1, -1], [-1, -1, -1, 1], [-1, -1, -1, -1],
];
const BISHOP_VECS: [V4; 24] = [
    [0, 0, 1, 1], [0, 0, 1, -1], [0, 0, -1, 1], [0, 0, -1, -1],
    [0, 1, 0, 1], [0, 1, 0, -1], [0, -1, 0, 1], [0, -1, 0, -1],
    [0, 1, 1, 0], [0, 1, -1, 0], [0, -1, 1, 0], [0, -1, -1, 0],
    [1, 0, 0, 1], [1, 0, 0, -1], [-1, 0, 0, 1], [-1, 0, 0, -1],
    [1, 0, 1, 0], [1, 0, -1, 0], [-1, 0, 1, 0], [-1, 0, -1, 0],
    [1, 1, 0, 0], [1, -1, 0, 0], [-1, 1, 0, 0], [-1, -1, 0, 0],
];
const ROOK_VECS: [V4; 8] = [
    [0, 0, 0, 1], [0, 0, 0, -1], [0, 0, 1, 0], [0, 0, -1, 0],
    [0, 1, 0, 0], [0, -1, 0, 0], [1, 0, 0, 0], [-1, 0, 0, 0],
];
const QUEEN_VECS: [V4; 80] = [
    [0, 0, 0, 1], [0, 0, 0, -1],
    [0, 0, 1, 0], [0, 0, -1, 0],
    [0, 0, 1, 1], [0, 0, -1, 1], [0, 0, 1, -1], [0, 0, -1, -1],
    [0, 1, 0, 0], [0, -1, 0, 0],
    [0, 1, 0, 1], [0, 1, 0, -1], [0, -1, 0, 1], [0, -1, 0, -1],
    [0, 1, 1, 0], [0, 1, -1, 0], [0, -1, 1, 0], [0, -1, -1, 0],
    [0, 1, 1, 1], [0, 1, 1, -1], [0, 1, -1, 1], [0, 1, -1, -1],
    [0, -1, 1, 1], [0, -1, 1, -1], [0, -1, -1, 1], [0, -1, -1, -1],
    [1, 0, 0, 0], [-1, 0, 0, 0],
    [1, 0, 0, 1], [1, 0, 0, -1], [-1, 0, 0, 1], [-1, 0, 0, -1],
    [1, 0, 1, 0], [1, 0, -1, 0], [-1, 0, 1, 0], [-1, 0, -1, 0],
    [1, 0, 1, 1], [1, 0, 1, -1], [1, 0, -1, 1], [1, 0, -1, -1],
    [-1, 0, 1, 1], [-1, 0, 1, -1], [-1, 0, -1, 1], [-1, 0, -1, -1],
    [1, 1, 0, 0], [1, -1, 0, 0], [-1, 1, 0, 0], [-1, -1, 0, 0],
    [1, 1, 0, 1], [1, 1, 0, -1], [1, -1, 0, 1], [1, -1, 0, -1],
    [-1, 1, 0, 1], [-1, 1, 0, -1], [-1, -1, 0, 1], [-1, -1, 0, -1],
    [1, 1, 1, 0], [1, 1, -1, 0], [1, -1, 1, 0], [1, -1, -1, 0],
    [-1, 1, 1, 0], [-1, 1, -1, 0], [-1, -1, 1, 0], [-1, -1, -1, 0],
    [1, 1, 1, 1], [1, 1, 1, -1], [1, 1, -1, 1], [1, 1, -1, -1],
    [1, -1, 1, 1], [1, -1, 1, -1], [1, -1, -1, 1], [1, -1, -1, -1],
    [-1, 1, 1, 1], [-1, 1, 1, -1], [-1, 1, -1, 1], [-1, 1, -1, -1],
    [-1, -1, 1, 1], [-1, -1, 1, -1], [-1, -1, -1, 1], [-1, -1, -1, -1],
];
const PRINCESS_VECS: [V4; 32] = [
    [0, 0, 0, 1], [0, 0, 0, -1],
    [0, 0, 1, 0], [0, 0, -1, 0],
    [0, 0, 1, 1], [0, 0, 1, -1], [0, 0, -1, 1], [0, 0, -1, -1],
    [0, 1, 0, 0], [0, -1, 0, 0],
    [0, 1, 0, 1], [0, 1, 0, -1], [0, -1, 0, 1], [0, -1, 0, -1],
    [0, 1, 1, 0], [0, 1, -1, 0], [0, -1, 1, 0], [0, -1, -1, 0],
    [1, 0, 0, 0], [-1, 0, 0, 0],
    [1, 0, 0, 1], [1, 0, 0, -1], [-1, 0, 0, 1], [-1, 0, 0, -1],
    [1, 0, 1, 0], [1, 0, -1, 0], [-1, 0, 1, 0], [-1, 0, -1, 0],
    [1, 1, 0, 0], [1, -1, 0, 0], [-1, 1, 0, 0], [-1, -1, 0, 0],
];
const UNICORN_VECS: [V4; 32] = [
    [0, 1, 1, 1], [0, 1, 1, -1], [0, 1, -1, 1], [0, 1, -1, -1],
    [0, -1, 1, 1], [0, -1, 1, -1], [0, -1, -1, 1], [0, -1, -1, -1],
    [1, 0, 1, 1], [1, 0, 1, -1], [1, 0, -1, 1], [1, 0, -1, -1],
    [-1, 0, 1, 1], [-1, 0, 1, -1], [-1, 0, -1, 1], [-1, 0, -1, -1],
    [1, 1, 0, 1], [1, 1, 0, -1], [1, -1, 0, 1], [1, -1, 0, -1],
    [-1, 1, 0, 1], [-1, 1, 0, -1], [-1, -1, 0, 1], [-1, -1, 0, -1],
    [1, 1, 1, 0], [1, 1, -1, 0], [1, -1, 1, 0], [1, -1, -1, 0],
    [-1, 1, 1, 0], [-1, 1, -1, 0], [-1, -1, 1, 0], [-1, -1, -1, 0],
];
const DRAGON_VECS: [V4; 16] = [
    [1, 1, 1, 1], [1, 1, 1, -1], [1, 1, -1, 1], [1, 1, -1, -1],
    [1, -1, 1, 1], [1, -1, 1, -1], [1, -1, -1, 1], [1, -1, -1, -1],
    [-1, 1, 1, 1], [-1, 1, 1, -1], [-1, 1, -1, 1], [-1, 1, -1, -1],
    [-1, -1, 1, 1], [-1, -1, 1, -1], [-1, -1, -1, 1], [-1, -1, -1, -1],
];
const EMPTY: [V4; 0] = [];
const SPATIAL_LENGTH: [usize; 24] = [
    0, 0, 4, 4, 8, 8, 4, 4,
    8, 8, 8, 8, 8, 8, 0, 0,
    8, 8, 8, 8, 0, 0, 0, 0,
];

//For the check scanner: non-spatial single-square moves of a piece, grouped by
//(dl, dt) "combo" (25 combos: dl, dt in -2..=2), each a bitmask of (dr, df)
//square offsets (also -2..=2). Lets the scanner resolve each target board once
//and test king squares with one mask lookup instead of probing every vector.
const fn build_combo_mask(table: &[V4], spatial: usize) -> [u32; 25] {
    let mut res = [0u32; 25];
    let mut i = spatial;
    while i < table.len() {
        let combo = ((table[i][0] + 2) * 5 + (table[i][1] + 2)) as usize;
        let bit = ((table[i][2] + 2) * 5 + (table[i][3] + 2)) as usize;
        res[combo] |= 1 << bit;
        i += 1;
    }
    res
}
const KNIGHT_COMBO_MASK: [u32; 25] = build_combo_mask(&KNIGHT_POS, 8);
const KING_COMBO_MASK: [u32; 25] = build_combo_mask(&KING_POS, 8);

fn move_pos(abs_piece: i8) -> &'static [V4] {
    match abs_piece {
        5 | 6 => &KNIGHT_POS,
        11 | 12 | 17 | 18 => &KING_POS,
        _ => &EMPTY,
    }
}
fn move_vecs(abs_piece: i8) -> &'static [V4] {
    match abs_piece {
        3 | 4 => &BISHOP_VECS,
        7 | 8 => &ROOK_VECS,
        9 | 10 | 19 | 20 => &QUEEN_VECS,
        13 | 14 => &PRINCESS_VECS,
        21 | 22 => &UNICORN_VECS,
        23 | 24 => &DRAGON_VECS,
        _ => &EMPTY,
    }
}

//=== core types ===============================================================
type Board = [i8; 64];
#[inline]
fn sq(r: i32, f: i32) -> usize {
    (r * 8 + f) as usize
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct P4 {
    l: i32,
    t: i32,
    r: i32,
    f: i32,
}

#[derive(Clone, Copy)]
enum Extra {
    None,
    EnPassant(P4),      //captured pawn position (moves[2], no moves[3])
    Castle(P4, P4),     //rook source (moves[2]) and rook destination (moves[3])
}

#[derive(Clone, Copy)]
struct Mv {
    s: P4,
    d: P4,
    promo: i8, //0 = none, else dest[4]
    extra: Extra,
}

//Boards are immutable once a move is fully applied; caches key on arena index.
struct Arena {
    boards: Vec<Board>,
    hashes: Vec<u64>,                       //0 = not yet computed
    spatial: Vec<[Option<Rc<Vec<u16>>>; 2]>, //king-capture pairs per king color
    pieces: Vec<[Option<Rc<Vec<u16>>>; 2]>,  //(sq<<8|piece) per piece parity
}
impl Arena {
    fn new() -> Arena {
        Arena { boards: Vec::new(), hashes: Vec::new(), spatial: Vec::new(), pieces: Vec::new() }
    }
    fn push(&mut self, b: Board) -> i32 {
        self.boards.push(b);
        self.hashes.push(0);
        self.spatial.push([None, None]);
        self.pieces.push([None, None]);
        (self.boards.len() - 1) as i32
    }
    //All pieces of one color on a board, in (rank, file) ascending order,
    //packed as (square << 8) | piece-byte. Cached per arena board.
    fn piece_list(&mut self, bidx: usize, parity: usize) -> Rc<Vec<u16>> {
        if let Some(cached) = &self.pieces[bidx][parity] {
            return Rc::clone(cached);
        }
        let board = &self.boards[bidx];
        let mut list: Vec<u16> = Vec::new();
        for k in 0..64usize {
            let piece = board[k];
            if piece == 0 || ((piece as i32).abs() % 2) as usize != parity {
                continue;
            }
            list.push(((k as u16) << 8) | (piece as u8 as u16));
        }
        let rc = Rc::new(list);
        self.pieces[bidx][parity] = Some(Rc::clone(&rc));
        rc
    }
    fn board_hash(&mut self, idx: i32) -> u64 {
        let i = idx as usize;
        if self.hashes[i] != 0 {
            return self.hashes[i];
        }
        let mut h: u64 = 0xcbf29ce484222325;
        for &v in self.boards[i].iter() {
            h = (h ^ (v as i64 as u64)).wrapping_mul(0x100000001b3);
        }
        if h == 0 {
            h = 1;
        }
        self.hashes[i] = h;
        h
    }
}

//The multiverse: tls[l] mirrors rawBoard[l] (None = null/hole slot); entries
//are arena board indices, -1 = null turn (gap before a late-created timeline).
struct Pos {
    tls: Vec<Option<Vec<i32>>>,
    action: i32,
    is_even: bool,          //isEvenTimeline: constant for a game
    promos: Option<Vec<i8>>,
}

//=== board.js ports ===========================================================
#[inline]
fn timeline_move(l: i32, v: i32, is_even: bool) -> i32 {
    let mut res = if l % 2 == 0 { l + v * 2 } else { l - v * 2 };
    if !is_even && res < 0 {
        res = -res - 1;
    }
    if is_even && res <= 0 {
        res = -res + 1;
    }
    res
}

#[inline]
fn pos_exists(p: &Pos, a: P4) -> bool {
    if a.l < 0 || a.l as usize >= p.tls.len() {
        return false;
    }
    match &p.tls[a.l as usize] {
        None => false,
        Some(tl) => {
            a.t >= 0
                && (a.t as usize) < tl.len()
                && tl[a.t as usize] >= 0
                && a.r >= 0
                && a.r < 8
                && a.f >= 0
                && a.f < 8
        }
    }
}

#[inline]
fn board_idx(p: &Pos, l: i32, t: i32) -> i32 {
    p.tls[l as usize].as_ref().unwrap()[t as usize]
}
#[inline]
fn piece_at(p: &Pos, arena: &Arena, a: P4) -> i8 {
    arena.boards[board_idx(p, a.l, a.t) as usize][sq(a.r, a.f)]
}

//present(fullBoard, action), restructured but result-identical: the active-
//timeline filter is applied inline, and the "largest t with a board (of the
//action's parity)" scans run from the tip backwards with early exit instead
//of walking every turn.
fn present_timelines(p: &Pos, res: &mut Vec<usize>) {
    res.clear();
    let mut min_tl: usize = 0;
    let mut max_tl: usize = 0;
    for l in 0..p.tls.len() {
        if p.tls[l].is_none() {
            continue;
        }
        if min_tl < l && l % 2 != 0 {
            min_tl = l;
        }
        if max_tl < l && l % 2 == 0 {
            max_tl = l;
        }
    }
    let is_active = |l: usize| (max_tl + 1 >= l && l % 2 != 0) || (min_tl + 3 >= l && l % 2 == 0);
    let parity = (p.action % 2) as usize;
    let mut lowest: i64 = -1;
    for l in 0..p.tls.len() {
        let tl = match &p.tls[l] {
            Some(tl) => tl,
            None => continue,
        };
        if !is_active(l) {
            continue;
        }
        let mut cur_max: i64 = -1;
        for t in (0..tl.len()).rev() {
            if tl[t] >= 0 && t % 2 == parity {
                cur_max = t as i64;
                break;
            }
        }
        if cur_max != -1 && (lowest == -1 || lowest > cur_max) {
            lowest = cur_max;
        }
    }
    if lowest >= 0 {
        for l in 0..p.tls.len() {
            let tl = match &p.tls[l] {
                Some(tl) => tl,
                None => continue,
            };
            if !is_active(l) {
                continue;
            }
            let mut cur_max: i64 = 0;
            for t in (0..tl.len()).rev() {
                if tl[t] >= 0 {
                    if cur_max < t as i64 {
                        cur_max = t as i64;
                    }
                    break;
                }
            }
            if lowest == cur_max {
                res.push(l);
            }
            if lowest > cur_max {
                res.clear();
                return;
            }
        }
    }
}

//position_is_attacked: spatial-only attack probe used by castling generation.
//Verbatim port of board.js positionIsAttacked including its fall-through quirks.
fn position_is_attacked(board: &Board, r0: i32, f0: i32, player: i32) -> bool {
    //Knight
    for i in 0..8 {
        let r = r0 + KNIGHT_POS[i][2] as i32;
        let f = f0 + KNIGHT_POS[i][3] as i32;
        if r < 0 || r >= 8 || f < 0 || f >= 8 {
            continue;
        }
        let cur = (board[sq(r, f)] as i32).abs();
        if cur != 0 && cur - player == 5 {
            return true;
        }
    }
    //Rook/file directions (first 4 queen vectors)
    for i in 0..4 {
        let rm = QUEEN_VECS[i][2] as i32;
        let fm = QUEEN_VECS[i][3] as i32;
        let mut r = r0 + rm;
        let mut f = f0 + fm;
        if r >= 0 && r < 8 && f >= 0 && f < 8 {
            let cur = (board[sq(r, f)] as i32).abs();
            if cur != 0 {
                let comp = cur - player;
                if cur % 2 == player {
                    continue;
                }
                if (7..=13).contains(&comp) || comp == 17 || comp == 19 {
                    return true;
                }
                //upstream quirk: enemy non-attacker does not stop the ray scan
            }
            r += rm;
            f += fm;
            while r >= 0 && r < 8 && f >= 0 && f < 8 {
                let cur = (board[sq(r, f)] as i32).abs();
                if cur != 0 {
                    if cur % 2 != player {
                        let comp = cur - player;
                        if comp == 7 || comp == 9 || comp == 13 || comp == 19 {
                            return true;
                        }
                    }
                    break;
                }
                r += rm;
                f += fm;
            }
        }
    }
    //Diagonal directions (queen vectors 4..8)
    for i in 4..8 {
        let rm = QUEEN_VECS[i][2] as i32;
        let fm = QUEEN_VECS[i][3] as i32;
        let mut r = r0 + rm;
        let mut f = f0 + fm;
        if r >= 0 && r < 8 && f >= 0 && f < 8 {
            let cur = (board[sq(r, f)] as i32).abs();
            if cur != 0 {
                let comp = cur - player;
                if cur % 2 == player {
                    continue;
                }
                if comp == 5 || comp == 7 || comp == 21 || comp == 23 {
                    continue;
                }
                return true;
            }
            r += rm;
            f += fm;
            while r >= 0 && r < 8 && f >= 0 && f < 8 {
                let cur = (board[sq(r, f)] as i32).abs();
                if cur != 0 {
                    if cur % 2 != player {
                        let comp = cur - player;
                        if comp == 3 || comp == 9 || comp == 13 || comp == 19 {
                            return true;
                        }
                    }
                    break;
                }
                r += rm;
                f += fm;
            }
        }
    }
    false
}

//=== piece.js ports ===========================================================
fn available_promotion_pieces(p: &Pos, arena: &Arena) -> Vec<i8> {
    let mut res: Vec<i8> = Vec::new();
    for l in 0..p.tls.len() {
        let tl = match &p.tls[l] {
            Some(tl) => tl,
            None => continue,
        };
        for &e in tl.iter() {
            if e < 0 {
                continue;
            }
            for &v in arena.boards[e as usize].iter() {
                let piece = v.abs();
                let is_not_royalty =
                    (3..=10).contains(&piece) || piece == 13 || piece == 14 || piece == 17 || piece == 18;
                if is_not_royalty && !res.contains(&piece) {
                    res.push(piece);
                    let opp = if piece % 2 == 0 { piece - 1 } else { piece + 1 };
                    if !res.contains(&opp) {
                        res.push(opp);
                    }
                }
            }
        }
    }
    res.sort_by(|a, b| b.cmp(a));
    res
}

fn effective_promos<'a>(p: &Pos, arena: &Arena, promos: &'a Option<Vec<i8>>, cache: &'a mut Option<Vec<i8>>) -> &'a [i8] {
    if let Some(v) = promos {
        if !v.is_empty() {
            return v;
        }
    }
    if cache.is_none() {
        *cache = Some(available_promotion_pieces(p, arena));
    }
    cache.as_ref().unwrap()
}

//promotionPiece helper: push either promotion moves or the plain move
#[allow(clippy::too_many_arguments)]
fn promotion_piece(
    p: &Pos,
    arena: &Arena,
    s: P4,
    r_pos: i32,
    f_pos: i32,
    promos: &Option<Vec<i8>>,
    promo_cache: &mut Option<Vec<i8>>,
    promotion_rank: i32,
    piece_color: i32,
    out: &mut Vec<Mv>,
) {
    let d = P4 { l: s.l, t: s.t, r: r_pos, f: f_pos };
    if r_pos == promotion_rank {
        let list = effective_promos(p, arena, promos, promo_cache);
        for &piece in list {
            if (piece % 2) as i32 != piece_color {
                continue;
            }
            out.push(Mv { s, d, promo: piece, extra: Extra::None });
        }
    } else {
        out.push(Mv { s, d, promo: 0, extra: Extra::None });
    }
}

#[allow(clippy::too_many_arguments)]
fn en_passant(
    p: &Pos,
    arena: &Arena,
    s: P4,
    cur_board: &Board,
    piece_color: i32,
    forward: i32,
    r_pos: i32,
    f_pos: i32,
    out: &mut Vec<Mv>,
) {
    if f_pos < 0 || f_pos >= 8 {
        return;
    }
    //moved enemy pawn/brawn right beside us
    let dest_piece = cur_board[sq(s.r, f_pos)] as i32 - piece_color;
    if dest_piece != 1 && dest_piece != 15 {
        return;
    }
    let r_pos_en = r_pos + forward;
    if r_pos_en >= 0 && r_pos_en < 8 && f_pos >= 0 && f_pos < 8 {
        //its double-move source square is now blank
        if cur_board[sq(r_pos_en, f_pos)] != 0 {
            return;
        }
        if pos_exists(p, P4 { l: s.l, t: s.t - 2, r: r_pos_en, f: f_pos })
            && pos_exists(p, P4 { l: s.l, t: s.t - 2, r: s.r, f: f_pos })
        {
            let past = &arena.boards[board_idx(p, s.l, s.t - 2) as usize];
            if past[sq(s.r, f_pos)] != 0 {
                return;
            }
            if past[sq(r_pos_en, f_pos)] as i32 + piece_color == -1
                || past[sq(r_pos_en, f_pos)] as i32 + piece_color == -15
            {
                out.push(Mv {
                    s,
                    d: P4 { l: s.l, t: s.t, r: r_pos, f: f_pos },
                    promo: 0,
                    extra: Extra::EnPassant(P4 { l: s.l, t: s.t, r: s.r, f: f_pos }),
                });
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn en_passant_movement(
    p: &Pos,
    arena: &Arena,
    s: P4,
    promotion_rank: i32,
    promos: &Option<Vec<i8>>,
    promo_cache: &mut Option<Vec<i8>>,
    forward: i32,
    cur_board: &Board,
    piece_color: i32,
    r_pos: i32,
    f_pos: i32,
    out: &mut Vec<Mv>,
) {
    //upstream's bounds check is `rPos < 0 && rPos >= len` (never true); a pawn
    //on its own promotion rank cannot exist, so r_pos is always in range here
    if r_pos < 0 || r_pos >= 8 || f_pos < 0 || f_pos >= 8 {
        return;
    }
    let dest_piece = cur_board[sq(r_pos, f_pos)];
    if dest_piece != 0 && (dest_piece as i32).abs() % 2 != piece_color {
        promotion_piece(p, arena, s, r_pos, f_pos, promos, promo_cache, promotion_rank, piece_color, out);
    }
    en_passant(p, arena, s, cur_board, piece_color, forward, r_pos, f_pos, out);
}

fn opponent_timeline_capture(p: &Pos, arena: &Arena, s: P4, cur: P4, piece_color: i32, out: &mut Vec<Mv>) {
    if pos_exists(p, cur) {
        //upstream reads [curMove[0]][curMove[1]][givenRank][givenFile]; cur.r/f
        //equal the given rank/file for pawn timeline captures
        let dest_piece = arena.boards[board_idx(p, cur.l, cur.t) as usize][sq(s.r, s.f)];
        if dest_piece != 0 && (dest_piece as i32).abs() % 2 != piece_color {
            out.push(Mv { s, d: cur, promo: 0, extra: Extra::None });
        }
    }
}

//pieceFuncs.moves: all moves of one piece, in upstream order
fn gen_piece_moves(p: &Pos, arena: &Arena, s: P4, spatial_only: bool, out: &mut Vec<Mv>) {
    if !pos_exists(p, s) {
        return;
    }
    let piece = piece_at(p, arena, s);
    if piece == 0 {
        return;
    }
    let abs_piece = (piece as i32).abs() as i8;
    let piece_color = (abs_piece % 2) as i32;
    let is_even = p.is_even;
    let bidx = board_idx(p, s.l, s.t) as usize;
    let cur_board = &arena.boards[bidx];
    let promos = &p.promos;
    let mut promo_cache: Option<Vec<i8>> = None;

    if abs_piece == 1 || abs_piece == 2 || abs_piece == 15 || abs_piece == 16 {
        //Pawn / brawn
        let forward = if piece_color == 1 { -1 } else { 1 };
        let promotion_rank = if piece_color == 1 { 0 } else { 7 };
        let r_pos = s.r + forward;

        //Forward single/double square RF movement
        if r_pos >= 0 && r_pos < 8 && s.f >= 0 && s.f < 8 {
            if cur_board[sq(r_pos, s.f)] == 0 {
                promotion_piece(p, arena, s, r_pos, s.f, promos, &mut promo_cache, promotion_rank, piece_color, out);
                if piece < 0 {
                    let r_double = r_pos + forward;
                    if r_double >= 0 && r_double < 8 && cur_board[sq(r_double, s.f)] == 0 {
                        promotion_piece(p, arena, s, r_double, s.f, promos, &mut promo_cache, promotion_rank, piece_color, out);
                    }
                }
            }
        }
        //Diagonal capture / en passant
        en_passant_movement(p, arena, s, promotion_rank, promos, &mut promo_cache, forward, cur_board, piece_color, r_pos, s.f + 1, out);
        en_passant_movement(p, arena, s, promotion_rank, promos, &mut promo_cache, forward, cur_board, piece_color, r_pos, s.f - 1, out);

        if !spatial_only {
            //Forward single square LT movement
            let cur = P4 { l: timeline_move(s.l, -forward, is_even), t: s.t, r: s.r, f: s.f };
            if pos_exists(p, cur) && piece_at(p, arena, cur) == 0 {
                out.push(Mv { s, d: cur, promo: 0, extra: Extra::None });
                //Forward double square LT movement
                if piece < 0 {
                    let cur2 = P4 { l: timeline_move(s.l, -forward * 2, is_even), t: s.t, r: s.r, f: s.f };
                    if pos_exists(p, cur2) && piece_at(p, arena, cur2) == 0 {
                        out.push(Mv { s, d: cur2, promo: 0, extra: Extra::None });
                    }
                }
            }
            //Timeline captures
            let l_cap = timeline_move(s.l, -forward, is_even);
            opponent_timeline_capture(p, arena, s, P4 { l: l_cap, t: s.t + 2, r: s.r, f: s.f }, piece_color, out);
            opponent_timeline_capture(p, arena, s, P4 { l: l_cap, t: s.t - 2, r: s.r, f: s.f }, piece_color, out);

            //Brawn-specific captures
            if abs_piece == 15 || abs_piece == 16 {
                let cardinalities: [[i32; 4]; 4] = [
                    [-forward, 0, 0, 1],
                    [-forward, 0, 0, -1],
                    [-forward, 0, forward, 0],
                    [0, -1, forward, 0],
                ];
                for [dl, dt, dy, dx] in cardinalities {
                    let mut d = P4 { l: s.l, t: s.t + 2 * dt, r: s.r + dy, f: s.f + dx };
                    d.l = timeline_move(d.l, dl, is_even);
                    if !pos_exists(p, d) {
                        continue;
                    }
                    let dest_piece = piece_at(p, arena, d);
                    if dest_piece == 0 || (dest_piece as i32).abs() % 2 == piece_color {
                        continue;
                    }
                    if d.r == promotion_rank {
                        let list = effective_promos(p, arena, promos, &mut promo_cache).to_vec();
                        for piece in list {
                            if (piece % 2) as i32 != piece_color {
                                continue;
                            }
                            out.push(Mv { s, d, promo: piece, extra: Extra::None });
                        }
                    } else {
                        out.push(Mv { s, d, promo: 0, extra: Extra::None });
                    }
                }
            }
        }
    } else {
        //All non-pawn/brawn pieces
        let spatial = SPATIAL_LENGTH[(abs_piece - 1) as usize];

        //Single square moves
        let move_pos_table = move_pos(abs_piece);
        if !move_pos_table.is_empty() {
            for i in 0..spatial {
                let r = s.r + move_pos_table[i][2] as i32;
                let f = s.f + move_pos_table[i][3] as i32;
                if r < 0 || r >= 8 || f < 0 || f >= 8 {
                    continue;
                }
                let dest_piece = cur_board[sq(r, f)];
                if dest_piece == 0 || (dest_piece as i32).abs() % 2 != piece_color {
                    out.push(Mv { s, d: P4 { l: s.l, t: s.t, r, f }, promo: 0, extra: Extra::None });
                }
            }
            if !spatial_only {
                for i in spatial..move_pos_table.len() {
                    let cur = P4 {
                        l: timeline_move(s.l, move_pos_table[i][0] as i32, is_even),
                        t: s.t + move_pos_table[i][1] as i32 * 2,
                        r: s.r + move_pos_table[i][2] as i32,
                        f: s.f + move_pos_table[i][3] as i32,
                    };
                    if !pos_exists(p, cur) {
                        continue;
                    }
                    let dest_piece = piece_at(p, arena, cur);
                    if dest_piece == 0 || (dest_piece as i32).abs() % 2 != piece_color {
                        out.push(Mv { s, d: cur, promo: 0, extra: Extra::None });
                    }
                }
            }
        }

        //Vector moves
        let move_vecs_table = move_vecs(abs_piece);
        if !move_vecs_table.is_empty() {
            for i in 0..spatial {
                let rm = move_vecs_table[i][2] as i32;
                let fm = move_vecs_table[i][3] as i32;
                let mut r = s.r + rm;
                let mut f = s.f + fm;
                while r >= 0 && r < 8 && f >= 0 && f < 8 {
                    let dest_piece = cur_board[sq(r, f)];
                    if dest_piece != 0 {
                        if (dest_piece as i32).abs() % 2 != piece_color {
                            out.push(Mv { s, d: P4 { l: s.l, t: s.t, r, f }, promo: 0, extra: Extra::None });
                        }
                        break;
                    }
                    out.push(Mv { s, d: P4 { l: s.l, t: s.t, r, f }, promo: 0, extra: Extra::None });
                    r += rm;
                    f += fm;
                }
            }
            if !spatial_only {
                for i in spatial..move_vecs_table.len() {
                    let lm = move_vecs_table[i][0] as i32;
                    let tm = move_vecs_table[i][1] as i32 * 2;
                    let rm = move_vecs_table[i][2] as i32;
                    let fm = move_vecs_table[i][3] as i32;
                    let mut cur = P4 {
                        l: timeline_move(s.l, lm, is_even),
                        t: s.t + tm,
                        r: s.r + rm,
                        f: s.f + fm,
                    };
                    while pos_exists(p, cur) {
                        let dest_piece = piece_at(p, arena, cur);
                        if dest_piece != 0 {
                            if (dest_piece as i32).abs() % 2 != piece_color {
                                out.push(Mv { s, d: cur, promo: 0, extra: Extra::None });
                            }
                            break;
                        }
                        out.push(Mv { s, d: cur, promo: 0, extra: Extra::None });
                        cur.l = timeline_move(cur.l, lm, is_even);
                        cur.t += tm;
                        cur.r += rm;
                        cur.f += fm;
                    }
                }
            }
        }

        //Castling (unmoved royal kings only)
        if piece == -11 || piece == -12 {
            let mut not_in_check: Option<bool> = None;

            //Kingside
            let mut f_pos = s.f + 1;
            if f_pos >= 0 && f_pos < 8 && cur_board[sq(s.r, f_pos)] == 0 {
                f_pos += 1;
                if f_pos >= 0 && f_pos < 8 && cur_board[sq(s.r, f_pos)] == 0 {
                    f_pos += 1;
                    while f_pos >= 0 && f_pos < 8 {
                        let cur_piece = cur_board[sq(s.r, f_pos)] as i32;
                        if cur_piece != 0 {
                            if cur_piece - piece_color == -8 {
                                let right_one = P4 { l: s.l, t: s.t, r: s.r, f: s.f + 1 };
                                let right_two = P4 { l: s.l, t: s.t, r: s.r, f: s.f + 2 };
                                let nic = !position_is_attacked(cur_board, s.r, s.f, piece_color);
                                not_in_check = Some(nic);
                                if nic
                                    && !position_is_attacked(cur_board, right_one.r, right_one.f, piece_color)
                                    && !position_is_attacked(cur_board, right_two.r, right_two.f, piece_color)
                                {
                                    out.push(Mv {
                                        s,
                                        d: right_two,
                                        promo: 0,
                                        extra: Extra::Castle(P4 { l: s.l, t: s.t, r: s.r, f: f_pos }, right_one),
                                    });
                                }
                            }
                            break;
                        }
                        f_pos += 1;
                    }
                }
            }

            //Queenside
            let mut f_pos = s.f - 1;
            if f_pos >= 0 && f_pos < 8 && cur_board[sq(s.r, f_pos)] == 0 {
                f_pos -= 1;
                if f_pos >= 0 && f_pos < 8 && cur_board[sq(s.r, f_pos)] == 0 {
                    f_pos -= 1;
                    while f_pos >= 0 && f_pos < 8 {
                        let cur_piece = cur_board[sq(s.r, f_pos)] as i32;
                        if cur_piece != 0 {
                            if cur_piece - piece_color == -8 {
                                let left_one = P4 { l: s.l, t: s.t, r: s.r, f: s.f - 1 };
                                let left_two = P4 { l: s.l, t: s.t, r: s.r, f: s.f - 2 };
                                let sides_ok = !position_is_attacked(cur_board, left_one.r, left_one.f, piece_color)
                                    && !position_is_attacked(cur_board, left_two.r, left_two.f, piece_color);
                                let king_safe = match not_in_check {
                                    Some(nic) => nic,
                                    None => !position_is_attacked(cur_board, s.r, s.f, piece_color),
                                };
                                if king_safe && sides_ok {
                                    out.push(Mv {
                                        s,
                                        d: left_two,
                                        promo: 0,
                                        extra: Extra::Castle(P4 { l: s.l, t: s.t, r: s.r, f: f_pos }, left_one),
                                    });
                                }
                            }
                            break;
                        }
                        f_pos -= 1;
                    }
                }
            }
        }
    }
}

//boardFuncs.moves(board, action, false, false, false, promos): every timeline
//whose latest board has the player to move, ascending slot order
fn gen_moves(p: &Pos, arena: &mut Arena, out: &mut Vec<Mv>) {
    let parity = (p.action % 2) as usize;
    for l in 0..p.tls.len() {
        let tl = match &p.tls[l] {
            Some(tl) => tl,
            None => continue,
        };
        let t = tl.len() - 1;
        if t % 2 != parity {
            continue;
        }
        let e = tl[t];
        if e < 0 {
            continue;
        }
        let list = arena.piece_list(e as usize, parity);
        for &pk in list.iter() {
            let k = (pk >> 8) as i32;
            gen_piece_moves(p, arena, P4 { l: l as i32, t: t as i32, r: k / 8, f: k % 8 }, false, out);
        }
    }
}

//=== apply / undo =============================================================
//A move touches at most two timelines: one op for the destination side (push
//onto an existing timeline or create a new one) and one push on the start
//timeline. Fixed-size, so apply never allocates.
#[derive(Clone, Copy)]
enum Op {
    None,
    Pushed(u32),
    NewTl { slot: u32, prev_len: u32 },
}
struct Undo {
    arena_len: u32, //arena size before this apply; undo truncates back to it
    a: Op, //destination-side op (applied first)
    b: Op, //start-timeline push
}

fn apply(p: &mut Pos, arena: &mut Arena, mv: &Mv) -> Undo {
    let mut ops = Undo { arena_len: arena.boards.len() as u32, a: Op::None, b: Op::None };
    let s = mv.s;
    let d = mv.d;
    //positionIsLatest guard (board.js move): non-latest start is a no-op
    if !pos_exists(p, s) || p.tls[s.l as usize].as_ref().unwrap().len() - 1 != s.t as usize {
        return ops;
    }
    let mut new_turn = arena.boards[board_idx(p, s.l, s.t) as usize];
    let dest_piece = if mv.promo != 0 { mv.promo } else { new_turn[sq(s.r, s.f)].abs() };
    if dest_piece != 0 {
        new_turn[sq(s.r, s.f)] = 0;
        if d.l == s.l && d.t == s.t {
            new_turn[sq(d.r, d.f)] = dest_piece;
        } else {
            let mut second = arena.boards[board_idx(p, d.l, d.t) as usize];
            second[sq(d.r, d.f)] = dest_piece;
            let dl = d.l as usize;
            if p.tls[dl].as_ref().unwrap().len() - 1 == d.t as usize {
                let idx = arena.push(second);
                p.tls[dl].as_mut().unwrap().push(idx);
                ops.a = Op::Pushed(dl as u32);
            } else {
                //new timeline: highest existing slot of the destination turn's
                //parity family, plus 2 (or slot 1/2 if the family is empty)
                let mut new_tl: usize = 0;
                for i in 1..p.tls.len() {
                    if p.tls[i].is_none() || i % 2 != (d.t as usize) % 2 {
                        continue;
                    }
                    if new_tl < i {
                        new_tl = i;
                    }
                }
                let slot = if new_tl == 0 {
                    if d.t % 2 == 0 { 2 } else { 1 }
                } else {
                    new_tl + 2
                };
                let prev_len = p.tls.len();
                if slot >= p.tls.len() {
                    p.tls.resize(slot + 1, None);
                }
                let mut v: Vec<i32> = vec![-1; (d.t + 1) as usize];
                v.push(arena.push(second));
                p.tls[slot] = Some(v);
                ops.a = Op::NewTl { slot: slot as u32, prev_len: prev_len as u32 };
            }
        }
        let idx = arena.push(new_turn);
        p.tls[s.l as usize].as_mut().unwrap().push(idx);
        ops.b = Op::Pushed(s.l as u32);
    }
    //moves[2]/moves[3]: en passant captured pawn removal / castling rook hop.
    //These write into boards created by this same apply, so caches are unset.
    match mv.extra {
        Extra::None => {}
        Extra::EnPassant(s2) => {
            let idx = board_idx(p, s2.l, s2.t + 1) as usize;
            arena.boards[idx][sq(s2.r, s2.f)] = 0;
        }
        Extra::Castle(s2, d2) => {
            let dp2 = arena.boards[board_idx(p, s2.l, s2.t) as usize][sq(s2.r, s2.f)].abs();
            let didx = board_idx(p, d2.l, d2.t + 1) as usize;
            arena.boards[didx][sq(d2.r, d2.f)] = dp2;
            let sidx = board_idx(p, s2.l, s2.t + 1) as usize;
            arena.boards[sidx][sq(s2.r, s2.f)] = 0;
        }
    }
    ops
}

fn undo(p: &mut Pos, arena: &mut Arena, ops: Undo) {
    for op in [ops.b, ops.a] {
        match op {
            Op::None => {}
            Op::Pushed(l) => {
                p.tls[l as usize].as_mut().unwrap().pop();
            }
            Op::NewTl { slot, prev_len } => {
                p.tls[slot as usize] = None;
                p.tls.truncate(prev_len as usize);
            }
        }
    }
    //Free the boards this apply created; without this a long search leaks
    //one or two boards per node and exhausts the wasm 4 GB address space.
    let n = ops.arena_len as usize;
    arena.boards.truncate(n);
    arena.hashes.truncate(n);
    arena.spatial.truncate(n);
    arena.pieces.truncate(n);
}

//=== check detection (port of fastPosition.js #checks + lean scanner) =========
#[inline]
fn is_king_of(dest_piece: i8, king_color: i32) -> bool {
    let t = (dest_piece as i32).abs();
    (t == 11 || t == 12 || t == 19 || t == 20) && t % 2 == king_color
}

//Same-board king captures, cached per arena board per king color.
//Pairs packed as (r1<<12 | f1<<8 | r2<<4 | f2).
fn spatial_king_captures(arena: &mut Arena, bidx: usize, king_color: i32) -> Rc<Vec<u16>> {
    if let Some(cached) = &arena.spatial[bidx][king_color as usize] {
        return Rc::clone(cached);
    }
    let board = arena.boards[bidx];
    let opp_parity = 1 - king_color;
    let mut pairs: Vec<u16> = Vec::new();
    let mut push = |r1: i32, f1: i32, r2: i32, f2: i32| {
        pairs.push(((r1 as u16) << 12) | ((f1 as u16) << 8) | ((r2 as u16) << 4) | f2 as u16);
    };
    for r in 0..8i32 {
        for f in 0..8i32 {
            let piece = board[sq(r, f)];
            if piece == 0 {
                continue;
            }
            let abs_piece = (piece as i32).abs() as i8;
            if (abs_piece % 2) as i32 != opp_parity {
                continue;
            }
            if abs_piece == 1 || abs_piece == 2 || abs_piece == 15 || abs_piece == 16 {
                let forward = if abs_piece % 2 == 1 { -1 } else { 1 };
                let r_pos = r + forward;
                if r_pos < 0 || r_pos >= 8 {
                    continue;
                }
                for f_pos in [f + 1, f - 1] {
                    if f_pos < 0 || f_pos >= 8 {
                        continue;
                    }
                    if is_king_of(board[sq(r_pos, f_pos)], king_color) {
                        push(r, f, r_pos, f_pos);
                    }
                }
                continue;
            }
            let mp = move_pos(abs_piece);
            let mvv = move_vecs(abs_piece);
            let spatial = SPATIAL_LENGTH[(abs_piece - 1) as usize];
            for i in 0..spatial.min(mp.len()) {
                let r_pos = r + mp[i][2] as i32;
                let f_pos = f + mp[i][3] as i32;
                if r_pos < 0 || r_pos >= 8 || f_pos < 0 || f_pos >= 8 {
                    continue;
                }
                if is_king_of(board[sq(r_pos, f_pos)], king_color) {
                    push(r, f, r_pos, f_pos);
                }
            }
            for i in 0..spatial.min(mvv.len()) {
                let rm = mvv[i][2] as i32;
                let fm = mvv[i][3] as i32;
                let mut r_pos = r + rm;
                let mut f_pos = f + fm;
                while r_pos >= 0 && r_pos < 8 && f_pos >= 0 && f_pos < 8 {
                    let dest_piece = board[sq(r_pos, f_pos)];
                    if dest_piece != 0 {
                        if is_king_of(dest_piece, king_color) {
                            push(r, f, r_pos, f_pos);
                        }
                        break;
                    }
                    r_pos += rm;
                    f_pos += fm;
                }
            }
        }
    }
    let rc = Rc::new(pairs);
    arena.spatial[bidx][king_color as usize] = Some(Rc::clone(&rc));
    rc
}

//4D-only king captures of one piece (spatial ones come from the cache above)
#[allow(clippy::too_many_arguments)]
fn scan_piece_king_captures(
    p: &Pos,
    arena: &Arena,
    s: P4,
    piece: i8,
    king_color: i32,
    detection_only: bool,
    out: &mut Vec<(P4, P4)>,
) -> bool {
    let abs_piece = (piece as i32).abs() as i8;
    let piece_color = (abs_piece % 2) as i32;
    let is_even = p.is_even;

    if abs_piece == 1 || abs_piece == 2 || abs_piece == 15 || abs_piece == 16 {
        let forward = if piece_color == 1 { -1 } else { 1 };
        let l_cap = timeline_move(s.l, -forward, is_even);
        for t_cap in [s.t + 2, s.t - 2] {
            let d = P4 { l: l_cap, t: t_cap, r: s.r, f: s.f };
            if !pos_exists(p, d) {
                continue;
            }
            let dest_piece = piece_at(p, arena, d);
            if dest_piece != 0 && (dest_piece as i32).abs() % 2 != piece_color && is_king_of(dest_piece, king_color) {
                if detection_only {
                    return true;
                }
                out.push((s, d));
            }
        }
        if abs_piece == 15 || abs_piece == 16 {
            let card: [[i32; 4]; 4] = [
                [-forward, 0, 0, 1],
                [-forward, 0, 0, -1],
                [-forward, 0, forward, 0],
                [0, -1, forward, 0],
            ];
            for [dl, dt, dy, dx] in card {
                let d = P4 {
                    l: timeline_move(s.l, dl, is_even),
                    t: s.t + 2 * dt,
                    r: s.r + dy,
                    f: s.f + dx,
                };
                if !pos_exists(p, d) {
                    continue;
                }
                let dest_piece = piece_at(p, arena, d);
                if dest_piece != 0 && (dest_piece as i32).abs() % 2 != piece_color && is_king_of(dest_piece, king_color) {
                    if detection_only {
                        return true;
                    }
                    out.push((s, d));
                }
            }
        }
        return false;
    }

    let mp = move_pos(abs_piece);
    let mvv = move_vecs(abs_piece);
    let spatial = SPATIAL_LENGTH[(abs_piece - 1) as usize];
    for i in spatial..mp.len() {
        let d = P4 {
            l: timeline_move(s.l, mp[i][0] as i32, is_even),
            t: s.t + mp[i][1] as i32 * 2,
            r: s.r + mp[i][2] as i32,
            f: s.f + mp[i][3] as i32,
        };
        if !pos_exists(p, d) {
            continue;
        }
        let dest_piece = piece_at(p, arena, d);
        if dest_piece != 0 && (dest_piece as i32).abs() % 2 != piece_color && is_king_of(dest_piece, king_color) {
            if detection_only {
                return true;
            }
            out.push((s, d));
        }
    }
    for i in spatial..mvv.len() {
        let lm = mvv[i][0] as i32;
        let tm = mvv[i][1] as i32 * 2;
        let rm = mvv[i][2] as i32;
        let fm = mvv[i][3] as i32;
        let mut cur = P4 {
            l: timeline_move(s.l, lm, is_even),
            t: s.t + tm,
            r: s.r + rm,
            f: s.f + fm,
        };
        while pos_exists(p, cur) {
            let dest_piece = piece_at(p, arena, cur);
            if dest_piece != 0 {
                if (dest_piece as i32).abs() % 2 != piece_color && is_king_of(dest_piece, king_color) {
                    if detection_only {
                        return true;
                    }
                    out.push((s, cur));
                }
                break;
            }
            cur.l = timeline_move(cur.l, lm, is_even);
            cur.t += tm;
            cur.r += rm;
            cur.f += fm;
        }
    }
    false
}

//All 4D (cross-board) king captures by pieces of one board. Produces the same
//SET of attacks as running scan_piece_king_captures over every piece, but
//resolves each of the 25 possible (dl, dt) target boards once per board, and
//tests single-square moves as one delta-mask lookup per king instead of
//probing every vector. Rays whose first target board is missing die for free.
#[allow(clippy::too_many_arguments)]
fn scan_board_4d(
    p: &Pos,
    arena: &mut Arena,
    l: i32,
    t: i32,
    bidx: usize,
    king_color: i32,
    detection_only: bool,
    out: &mut Vec<(P4, P4)>,
) -> bool {
    let is_even = p.is_even;
    //Resolve the 5x5 combo grid of target boards around (l, t)
    let mut combo_b: [i32; 25] = [-1; 25]; //arena index or -1
    let mut combo_lt: [(i32, i32); 25] = [(0, 0); 25];
    for dl in -2i32..=2 {
        for dt in -2i32..=2 {
            if dl == 0 && dt == 0 {
                continue;
            }
            let l2 = timeline_move(l, dl, is_even);
            let t2 = t + 2 * dt;
            if l2 < 0 || l2 as usize >= p.tls.len() || t2 < 0 {
                continue;
            }
            if let Some(tl) = &p.tls[l2 as usize] {
                if (t2 as usize) < tl.len() && tl[t2 as usize] >= 0 {
                    let idx = ((dl + 2) * 5 + (dt + 2)) as usize;
                    combo_b[idx] = tl[t2 as usize];
                    combo_lt[idx] = (l2, t2);
                }
            }
        }
    }
    //King squares of king_color per existing target board (royal pieces)
    let mut combo_kings: [([u8; 8], u8); 25] = [([0; 8], 0); 25];
    let mut oversized = false;
    for c in 0..25 {
        if combo_b[c] < 0 {
            continue;
        }
        let pieces = arena.piece_list(combo_b[c] as usize, (king_color % 2) as usize);
        let mut n = 0u8;
        for &pk in pieces.iter() {
            if is_king_of(pk as u8 as i8, king_color) {
                if n as usize >= 8 {
                    oversized = true;
                    break;
                }
                combo_kings[c].0[n as usize] = (pk >> 8) as u8;
                n += 1;
            }
        }
        combo_kings[c].1 = n;
    }

    let opp_parity = (1 - king_color) as usize;
    let list = arena.piece_list(bidx, opp_parity);
    for &pk in list.iter() {
        let k = (pk >> 8) as i32;
        let raw = pk as u8 as i8;
        let (r, f) = (k / 8, k % 8);
        let s = P4 { l, t, r, f };
        let abs_piece = (raw as i32).abs() as i8;

        //Brawns (and oversized royal counts) take the straightforward scanner
        if abs_piece == 15 || abs_piece == 16 || oversized {
            if scan_piece_king_captures(p, arena, s, raw, king_color, detection_only, out) {
                return true;
            }
            continue;
        }

        if abs_piece == 1 || abs_piece == 2 {
            //Pawn timeline captures: (timelineMove(l, -forward), t +- 2, same square)
            let forward = if abs_piece % 2 == 1 { -1i32 } else { 1 };
            for dt in [1i32, -1] {
                let idx = ((-forward + 2) * 5 + (dt + 2)) as usize;
                if combo_b[idx] < 0 {
                    continue;
                }
                if is_king_of(arena.boards[combo_b[idx] as usize][sq(r, f)], king_color) {
                    if detection_only {
                        return true;
                    }
                    let (l2, t2) = combo_lt[idx];
                    out.push((s, P4 { l: l2, t: t2, r, f }));
                }
            }
            continue;
        }

        //Single-square 4D moves via delta masks
        let mask = match abs_piece {
            5 | 6 => Some(&KNIGHT_COMBO_MASK),
            11 | 12 | 17 | 18 => Some(&KING_COMBO_MASK),
            _ => None,
        };
        if let Some(mask) = mask {
            for c in 0..25usize {
                let m = mask[c];
                if m == 0 || combo_b[c] < 0 {
                    continue;
                }
                let (kings, n) = &combo_kings[c];
                for &ksq in kings[..*n as usize].iter() {
                    let dr = ksq as i32 / 8 - r;
                    let df = ksq as i32 % 8 - f;
                    if !(-2..=2).contains(&dr) || !(-2..=2).contains(&df) {
                        continue;
                    }
                    if m & (1 << ((dr + 2) * 5 + (df + 2))) != 0 {
                        if detection_only {
                            return true;
                        }
                        let (l2, t2) = combo_lt[c];
                        out.push((s, P4 { l: l2, t: t2, r: ksq as i32 / 8, f: ksq as i32 % 8 }));
                    }
                }
            }
        }

        //Sliding 4D moves: first step comes from the combo table (rays whose
        //first target board is missing die on one lookup), the rare
        //continuation walks like the straightforward scanner
        let mvv = move_vecs(abs_piece);
        let spatial = SPATIAL_LENGTH[(abs_piece - 1) as usize];
        for i in spatial..mvv.len() {
            let lm = mvv[i][0] as i32;
            let tm2 = mvv[i][1] as i32;
            let idx = ((lm + 2) * 5 + (tm2 + 2)) as usize;
            if combo_b[idx] < 0 {
                continue;
            }
            let rm = mvv[i][2] as i32;
            let fm = mvv[i][3] as i32;
            let mut cur = P4 { l: combo_lt[idx].0, t: combo_lt[idx].1, r: r + rm, f: f + fm };
            let mut cur_b = combo_b[idx];
            loop {
                if cur.r < 0 || cur.r >= 8 || cur.f < 0 || cur.f >= 8 {
                    break;
                }
                let dest_piece = arena.boards[cur_b as usize][sq(cur.r, cur.f)];
                if dest_piece != 0 {
                    if is_king_of(dest_piece, king_color) {
                        if detection_only {
                            return true;
                        }
                        out.push((s, cur));
                    }
                    break;
                }
                cur.l = timeline_move(cur.l, lm, is_even);
                cur.t += tm2 * 2;
                cur.r += rm;
                cur.f += fm;
                if !pos_exists(p, cur) {
                    break;
                }
                cur_b = p.tls[cur.l as usize].as_ref().unwrap()[cur.t as usize];
            }
        }
    }
    false
}

//Could the opponent capture one of our kings next action? Extends present
//timelines by a blank (reference-append) exactly like fastPosition.#checks,
//scans, then pops the appends. `present` is present_timelines(p), computed by
//the caller (it needs it anyway for submittable).
fn checks(p: &mut Pos, arena: &mut Arena, detection_only: bool, out: &mut Vec<(P4, P4)>, present: &[usize]) -> bool {
    let action = p.action;
    let king_color = action % 2;
    let mut appended: Vec<usize> = Vec::new();
    for &l in present {
        let tl = match &mut p.tls[l] {
            Some(tl) => tl,
            None => continue,
        };
        if (tl.len() - 1) % 2 != (action % 2) as usize {
            continue;
        }
        let last = tl[tl.len() - 1];
        tl.push(last);
        appended.push(l);
    }

    let mut found = false;
    let opp_parity = ((action + 1) % 2) as usize;
    'scan: for l in 0..p.tls.len() {
        let tl = match &p.tls[l] {
            Some(tl) => tl,
            None => continue,
        };
        let t = tl.len() - 1;
        if t % 2 != opp_parity {
            continue;
        }
        let e = tl[t];
        if e < 0 {
            continue;
        }
        //Same-board attacks, cached per board
        let pairs = spatial_king_captures(arena, e as usize, king_color);
        for &pk in pairs.iter() {
            if detection_only {
                found = true;
                break 'scan;
            }
            let (r1, f1, r2, f2) = (
                (pk >> 12) as i32,
                ((pk >> 8) & 0xf) as i32,
                ((pk >> 4) & 0xf) as i32,
                (pk & 0xf) as i32,
            );
            out.push((
                P4 { l: l as i32, t: t as i32, r: r1, f: f1 },
                P4 { l: l as i32, t: t as i32, r: r2, f: f2 },
            ));
        }
        if scan_board_4d(p, arena, l as i32, t as i32, e as usize, king_color, detection_only, out) {
            found = true;
            break 'scan;
        }
    }

    for &l in appended.iter() {
        p.tls[l].as_mut().unwrap().pop();
    }
    if detection_only {
        found
    } else {
        !out.is_empty()
    }
}

//=== hashing (content-based position hash for search dedup) ===================
#[inline]
fn mix(h: u64, v: u64) -> u64 {
    let x = (h ^ v).wrapping_mul(0x9e3779b97f4a7c15);
    x ^ (x >> 29)
}
fn pos_hash(p: &Pos, arena: &mut Arena) -> u64 {
    let mut h: u64 = 0x2545f4914f6cdd1d;
    for l in 0..p.tls.len() {
        let tl = match &p.tls[l] {
            Some(tl) => tl,
            None => continue,
        };
        h = mix(h, (l + 1) as u64);
        h = mix(h, tl.len() as u64);
        let from = tl.len().saturating_sub(2);
        for t in from..tl.len() {
            let e = tl[t];
            if e < 0 {
                continue;
            }
            let bh = arena.board_hash(e);
            h = mix(h, bh ^ t as u64);
        }
    }
    h
}

#[derive(Default)]
struct IdHasher(u64);
impl Hasher for IdHasher {
    fn finish(&self) -> u64 {
        self.0
    }
    fn write(&mut self, _bytes: &[u8]) {
        unreachable!();
    }
    fn write_u64(&mut self, v: u64) {
        self.0 = v;
    }
}
type Seen = HashSet<u64, BuildHasherDefault<IdHasher>>;

//=== search (port of shared/legalMoves.js) ====================================
const YES: u8 = 0;
const NO: u8 = 1;
const TIMEOUT: u8 = 2;

struct CheckInfo {
    dead: bool,
    hot: u128,
}
fn check_info_from(p: &Pos, list: &[(P4, P4)]) -> CheckInfo {
    let mut info = CheckInfo { dead: false, hot: 0 };
    for (s, e) in list {
        let same_board = s.l == e.l && s.t == e.t;
        let real_latest = match &p.tls[s.l as usize] {
            Some(tl) => tl.len() as i64 - 1,
            None => -1,
        };
        if same_board && s.t as i64 == real_latest {
            info.dead = true;
            return info;
        }
        info.hot |= 1u128 << (s.l as u32 & 127);
        info.hot |= 1u128 << (e.l as u32 & 127);
    }
    info
}

//Per-search reusable state: the dedup set plus per-depth buffer pools, so the
//DFS allocates nothing on the steady path.
//Check facts of one position: pure content function, cacheable by hash.
#[derive(Clone, Copy)]
struct CheckFacts {
    in_check: bool,
    dead: bool,
    hot: u128,
    //First checks (attacker square, checked king square), for evasion-first
    //move ordering. 4 is plenty: more checks only tighten the same ordering.
    n_checks: u8,
    checks: [(P4, P4); 4],
}

const P4_ZERO: P4 = P4 { l: 0, t: 0, r: 0, f: 0 };

//Reconstruct the unit step vector of a rider ray from attacker square s to
//king square e: (lm, tm, rm, fm, steps), tm in half-board units. None for
//non-rider geometry (knight-type checks have no blockable path).
fn ray_vec(p: &Pos, s: P4, e: P4) -> Option<(i32, i32, i32, i32, i32)> {
    let (dt, dr, df) = (e.t - s.t, e.r - s.r, e.f - s.f);
    let mut n = (dt.abs() / 2).max(dr.abs()).max(df.abs());
    let (tm, rm, fm);
    if n == 0 {
        //pure-timeline ray: find the step count by walking the slot arithmetic
        if s.l == e.l { return None; }
        for lm in [1i32, -1] {
            let mut cur = s.l;
            for k in 1..=64 {
                cur = timeline_move(cur, lm, p.is_even);
                if cur == e.l { n = k; break; }
                if cur < 0 || cur as usize >= p.tls.len() { break; }
            }
            if n != 0 { return Some((lm, 0, 0, 0, n)); }
        }
        return None;
    }
    tm = dt / n;
    rm = dr / n;
    fm = df / n;
    if tm * n != dt || rm * n != dr || fm * n != df { return None; }
    if !(tm == 0 || tm == 2 || tm == -2) || rm.abs() > 1 || fm.abs() > 1 { return None; }
    //timeline component: find the reflective unit step that lands on e.l
    'lm: for lm in [0i32, 1, -1] {
        let mut cur = s.l;
        for _ in 0..n {
            cur = timeline_move(cur, lm, p.is_even);
            if lm != 0 && (cur < 0 || cur as usize >= p.tls.len()) && cur != e.l { continue 'lm; }
        }
        if cur == e.l { return Some((lm, tm, rm, fm, n)); }
    }
    None
}

//Is x strictly between s and e on the straight/diagonal line s->e (one board)?
#[inline]
fn between_on_board(s: P4, e: P4, x: P4) -> bool {
    let (dr, df) = (e.r - s.r, e.f - s.f);
    let (xr, xf) = (x.r - s.r, x.f - s.f);
    if dr * xf - df * xr != 0 { return false; }
    let dot = xr * dr + xf * df;
    dot > 0 && dot < dr * dr + df * df
}

struct Ctx {
    seen: Seen,
    deadline: f64,
    move_bufs: Vec<Vec<Mv>>,
    order_bufs: Vec<Vec<Mv>>,
    list_bufs: Vec<Vec<(P4, P4)>>,
    present_bufs: Vec<Vec<usize>>,
    //Cross-root-move memo of PROVEN canComplete results (never timeouts):
    //after a root-move search ends NO without timing out, every position it
    //visited is proven uncompletable; a YES unwind path is proven completable.
    memo: std::collections::HashMap<u64, u8, BuildHasherDefault<IdHasher>>,
    yes_path: Vec<u64>,
    //checks() is a pure function of the position: cache unconditionally
    checks_memo: std::collections::HashMap<u64, CheckFacts, BuildHasherDefault<IdHasher>>,
}
impl Ctx {
    fn new(deadline: f64) -> Ctx {
        Ctx {
            seen: Seen::default(),
            deadline,
            move_bufs: Vec::new(),
            order_bufs: Vec::new(),
            list_bufs: Vec::new(),
            present_bufs: Vec::new(),
            memo: Default::default(),
            yes_path: Vec::new(),
            checks_memo: Default::default(),
        }
    }
    fn at_depth(&mut self, depth: usize) {
        while self.move_bufs.len() <= depth {
            self.move_bufs.push(Vec::new());
            self.order_bufs.push(Vec::new());
            self.list_bufs.push(Vec::new());
            self.present_bufs.push(Vec::new());
        }
    }
}

//Native-only phase counters for profiling (zero code in the wasm build)
#[cfg(not(target_arch = "wasm32"))]
pub mod stats {
    use std::sync::atomic::AtomicU64;
    pub static NODES: AtomicU64 = AtomicU64::new(0);
    pub static EDGES: AtomicU64 = AtomicU64::new(0);
    pub static T_PRESENT: AtomicU64 = AtomicU64::new(0);
    pub static T_CHECKS: AtomicU64 = AtomicU64::new(0);
    pub static T_GEN: AtomicU64 = AtomicU64::new(0);
    pub static T_STEP: AtomicU64 = AtomicU64::new(0); //apply+hash+undo
}
#[cfg(not(target_arch = "wasm32"))]
macro_rules! timed {
    ($slot:ident, $e:expr) => {{
        let __t = std::time::Instant::now();
        let __r = $e;
        stats::$slot.fetch_add(__t.elapsed().as_nanos() as u64, std::sync::atomic::Ordering::Relaxed);
        __r
    }};
}
#[cfg(target_arch = "wasm32")]
macro_rules! timed {
    ($slot:ident, $e:expr) => {{ $e }};
}
#[cfg(not(target_arch = "wasm32"))]
macro_rules! count {
    ($slot:ident, $n:expr) => {
        stats::$slot.fetch_add($n, std::sync::atomic::Ordering::Relaxed)
    };
}
#[cfg(target_arch = "wasm32")]
macro_rules! count {
    ($slot:ident, $n:expr) => {};
}

//Memo caps: a multi-minute search otherwise grows these tables past the
//wasm 4 GB address space (the tables are pure caches; clearing is safe).
const CHECKS_MEMO_CAP: usize = 2_000_000;
const SEEN_CAP: usize = 16_000_000;
const MEMO_CAP: usize = 8_000_000;

fn check_facts(p: &mut Pos, arena: &mut Arena, ctx: &mut Ctx, depth: usize, h: u64, present: &[usize]) -> CheckFacts {
    if let Some(f) = ctx.checks_memo.get(&h) {
        return *f;
    }
    let mut list = std::mem::take(&mut ctx.list_bufs[depth]);
    list.clear();
    timed!(T_CHECKS, checks(p, arena, false, &mut list, present));
    let info = check_info_from(p, &list);
    let mut facts = CheckFacts {
        in_check: !list.is_empty(), dead: info.dead, hot: info.hot,
        n_checks: 0, checks: [(P4_ZERO, P4_ZERO); 4],
    };
    for &pair in list.iter().take(4) {
        facts.checks[facts.n_checks as usize] = pair;
        facts.n_checks += 1;
    }
    ctx.list_bufs[depth] = list;
    if ctx.checks_memo.len() >= CHECKS_MEMO_CAP { ctx.checks_memo.clear(); }
    ctx.checks_memo.insert(h, facts);
    facts
}

//`h` is pos_hash(p); computed by the caller (it needs it for memoization).
fn can_complete(p: &mut Pos, arena: &mut Arena, ctx: &mut Ctx, depth: usize, h: u64) -> u8 {
    ctx.at_depth(depth);
    count!(NODES, 1);
    let mut present = std::mem::take(&mut ctx.present_bufs[depth]);
    timed!(T_PRESENT, present_timelines(p, &mut present));
    let facts = check_facts(p, arena, ctx, depth, h, &present);
    //submittable: no present board left to move on and not in check
    if present.is_empty() && !facts.in_check {
        ctx.present_bufs[depth] = present;
        ctx.yes_path.push(h);
        return YES;
    }
    if facts.dead {
        ctx.present_bufs[depth] = present;
        return NO;
    }
    if now_ms() > ctx.deadline {
        ctx.present_bufs[depth] = present;
        return TIMEOUT;
    }
    let mut moves = std::mem::take(&mut ctx.move_bufs[depth]);
    moves.clear();
    timed!(T_GEN, gen_moves(p, arena, &mut moves));
    //Past-king check pruning: a check on a king whose board is frozen (not
    //the latest of its timeline) can only ever be answered by capturing the
    //attacker, blocking on a square of the ray that lies on a still-growing
    //board, or a move to another board (travels shift timeline activation).
    //Same-action moves on distinct boards commute, so pruning the rest at
    //this node loses no completion.
    if facts.in_check && facts.n_checks > 0 {
        //Filter against the first check; any completion must answer all of
        //them, so one check's candidate superset is a valid restriction.
        {
            let (cs, ce) = facts.checks[0];
            let mut blockables: [P4; 32] = [P4_ZERO; 32];
            let mut nb = 0usize;
            if let Some((lm, tm, rm, fm, n)) = ray_vec(p, cs, ce) {
                let mut cur = cs;
                for _ in 1..n {
                    cur = P4 { l: timeline_move(cur.l, lm, p.is_even), t: cur.t + tm, r: cur.r + rm, f: cur.f + fm };
                    if nb >= blockables.len() { break; }
                    if cur.l < 0 || cur.l as usize >= p.tls.len() { continue; }
                    let latest = match &p.tls[cur.l as usize] { Some(tl) => tl.len() as i32 - 1, None => -1 };
                    //the board our own action creates sits one half-step later
                    if latest >= 0 && (latest - cur.t).abs() <= 1 {
                        blockables[nb] = P4 { l: cur.l, t: latest, r: cur.r, f: cur.f };
                        nb += 1;
                    }
                }
            }
            //Branching travels stay: they shift the present backward and can
            //activate older timelines, and checks are only scanned from
            //present timelines, so a branch can void this check (that is the
            //escape in mateAcrossTime). Non-branching jumps and unrelated
            //spatial moves cannot touch it and are pruned.
            moves.retain(|m| {
                //branching travel: destination board is not the latest of its timeline
                if (m.d.l != m.s.l || m.d.t != m.s.t)
                    && m.d.t < match &p.tls[m.d.l as usize] { Some(tl) => tl.len() as i32 - 1, None => 0 } {
                    return true;
                }
                let hits = |x: P4| -> bool {
                    if x.l == cs.l && x.r == cs.r && x.f == cs.f && (x.t - cs.t).abs() <= 1 { return true; } //capture the checker (also once copied forward)
                    for b in &blockables[..nb] {
                        if x.l == b.l && x.r == b.r && x.f == b.f && (x.t - b.t).abs() <= 1 { return true; }
                    }
                    false
                };
                if hits(m.d) { return true; }
                if let Extra::EnPassant(x) = m.extra {
                    if x.l == cs.l && x.r == cs.r && x.f == cs.f { return true; }
                }
                if let Extra::Castle(_, rd) = m.extra {
                    if hits(rd) { return true; }
                }
                //moving the checked king (it copies forward when its board
                //is a latest board; frozen kings simply have no such moves)
                if m.s.l == ce.l && m.s.r == ce.r && m.s.f == ce.f && (m.s.t - ce.t).abs() <= 1 { return true; }
                //same-board interposition between a slider and the king
                if cs.l == ce.l && cs.t == ce.t && m.d.l == cs.l && (m.d.t - cs.t).abs() <= 1
                    && between_on_board(cs, ce, P4 { l: cs.l, t: cs.t, r: m.d.r, f: m.d.f }) { return true; }
                false
            });
        }
    }
    {
        //Ordering only (results of a completed search don't depend on move
        //order): moves on boards involved in a check first, then moves on
        //present boards (a completion needs one move per present board;
        //moves elsewhere are optional), then the rest.
        let mut present_mask: u128 = 0;
        for &l in present.iter() {
            present_mask |= 1u128 << (l as u32 & 127);
        }
        let hot = facts.hot;
        let rank = |m: &Mv| -> u8 {
            if facts.in_check {
                //Evasion first: only moves that touch a check can be the move
                //that resolves it (capture the checker, move the checked
                //king, block between a slider and the king), and travels can
                //shift the present. Everything else almost never helps.
                for i in 0..facts.n_checks as usize {
                    let (cs, ce) = facts.checks[i];
                    if m.d == cs || m.s == ce { return 0; }
                    if cs.l == ce.l && cs.t == ce.t && m.d.l == cs.l && m.d.t == cs.t
                        && between_on_board(cs, ce, m.d) { return 0; }
                }
                if m.d.l != m.s.l || m.d.t != m.s.t { return 1; }
            }
            if hot != 0 && ((hot >> (m.s.l as u32 & 127)) & 1 == 1 || (hot >> (m.d.l as u32 & 127)) & 1 == 1) {
                return 2;
            }
            if (present_mask >> (m.s.l as u32 & 127)) & 1 == 1 {
                return 3;
            }
            4
        };
        let mut ordered = std::mem::take(&mut ctx.order_bufs[depth]);
        ordered.clear();
        for want in 0..5u8 {
            for m in moves.iter() {
                if rank(m) == want {
                    ordered.push(*m);
                }
            }
        }
        std::mem::swap(&mut moves, &mut ordered);
        ctx.order_bufs[depth] = ordered;
    }
    ctx.present_bufs[depth] = present;
    let mut timed_out = false;
    let mut result = NO;
    for mv in moves.iter() {
        count!(EDGES, 1);
        let u = timed!(T_STEP, apply(p, arena, mv));
        let ch = timed!(T_STEP, pos_hash(p, arena));
        if let Some(&r) = ctx.memo.get(&ch) {
            undo(p, arena, u);
            if r == YES {
                ctx.yes_path.push(h);
                ctx.move_bufs[depth] = moves;
                return YES;
            }
            continue; //proven NO
        }
        if ctx.seen.len() >= SEEN_CAP { ctx.seen.clear(); }
        if ctx.seen.insert(ch) {
            match can_complete(p, arena, ctx, depth + 1, ch) {
                YES => {
                    undo(p, arena, u);
                    result = YES;
                    break;
                }
                TIMEOUT => timed_out = true,
                _ => {}
            }
        }
        undo(p, arena, u);
    }
    ctx.move_bufs[depth] = moves;
    if result == YES {
        ctx.yes_path.push(h);
        YES
    } else if timed_out {
        TIMEOUT
    } else {
        NO
    }
}

//Run one root search and fold its proof into the cross-root-move memo.
fn search_root(p: &mut Pos, arena: &mut Arena, ctx: &mut Ctx, h: u64) -> u8 {
    if let Some(&r) = ctx.memo.get(&h) {
        return r;
    }
    ctx.seen.clear();
    ctx.yes_path.clear();
    let r = can_complete(p, arena, ctx, 0, h);
    if r == NO {
        //completed exhaustive search: everything it visited is uncompletable
        if ctx.memo.len() + ctx.seen.len() <= MEMO_CAP {
            for &x in ctx.seen.iter() {
                ctx.memo.insert(x, NO);
            }
        }
        ctx.memo.insert(h, NO);
    } else if r == YES {
        for i in 0..ctx.yes_path.len() {
            let x = ctx.yes_path[i];
            ctx.memo.insert(x, YES);
        }
    }
    r
}

//=== wire format ==============================================================
//Input i32 buffer:
//  [action, promoCount(-1=null), ...promos, numSlots,
//   per slot: (1, nTurns, entries...(-1=null|board ordinal)) | (0),
//   nBoards, then nBoards x 64 piece ints (rank-major)]
fn parse(buf: &[i32]) -> (Pos, Arena) {
    let mut i = 0usize;
    let mut next = || {
        let v = buf[i];
        i += 1;
        v
    };
    let action = next();
    let promo_count = next();
    let promos = if promo_count < 0 {
        None
    } else {
        Some((0..promo_count).map(|_| next() as i8).collect::<Vec<i8>>())
    };
    let num_slots = next() as usize;
    let mut tls: Vec<Option<Vec<i32>>> = Vec::with_capacity(num_slots);
    for _ in 0..num_slots {
        if next() == 1 {
            let n = next() as usize;
            let mut v = Vec::with_capacity(n + 8);
            for _ in 0..n {
                v.push(next());
            }
            tls.push(Some(v));
        } else {
            tls.push(None);
        }
    }
    let n_boards = next() as usize;
    let mut arena = Arena::new();
    for _ in 0..n_boards {
        let mut b: Board = [0; 64];
        for k in 0..64 {
            b[k] = next() as i8;
        }
        arena.push(b);
    }
    let is_even = tls.is_empty() || tls[0].is_none();
    (Pos { tls, action, is_even, promos }, arena)
}

//=== wasm exports =============================================================
static mut INBUF: Vec<i32> = Vec::new();
static mut OUTBUF: Vec<i32> = Vec::new();
fn inbuf() -> &'static mut Vec<i32> {
    unsafe { &mut *std::ptr::addr_of_mut!(INBUF) }
}
fn outbuf() -> &'static mut Vec<i32> {
    unsafe { &mut *std::ptr::addr_of_mut!(OUTBUF) }
}

#[no_mangle]
pub extern "C" fn v3_alloc(n: i32) -> *mut i32 {
    let b = inbuf();
    b.clear();
    b.resize(n as usize, 0);
    b.as_mut_ptr()
}

//codes per move: 0 legal, 1 illegal, 2 unknown; result = [n, codes...]
#[no_mangle]
pub extern "C" fn v3_classify(len: i32, total_ms: f64, per_move_ms: f64) -> *const i32 {
    let (mut p, mut arena) = parse(&inbuf()[..len as usize]);
    let mut root_moves: Vec<Mv> = Vec::new();
    gen_moves(&p, &mut arena, &mut root_moves);
    let end = now_ms() + total_ms;
    let out = outbuf();
    out.clear();
    out.push(root_moves.len() as i32);
    let mut ctx = Ctx::new(0.0);
    for mv in &root_moves {
        let u = apply(&mut p, &mut arena, mv);
        let t = now_ms() + per_move_ms;
        ctx.deadline = if end < t { end } else { t };
        let h = pos_hash(&p, &mut arena);
        let r = search_root(&mut p, &mut arena, &mut ctx, h);
        undo(&mut p, &mut arena, u);
        out.push(r as i32);
    }
    out.as_ptr()
}

#[no_mangle]
pub extern "C" fn v3_has_legal(len: i32, budget_ms: f64) -> i32 {
    let (mut p, mut arena) = parse(&inbuf()[..len as usize]);
    let mut ctx = Ctx::new(now_ms() + budget_ms);
    let h = pos_hash(&p, &mut arena);
    can_complete(&mut p, &mut arena, &mut ctx, 0, h) as i32
}

//Debug/differential-test export: the raw move list in upstream order.
//Format: [total i32 count, then per move: nPositions, per position: nInts, ints]
#[no_mangle]
pub extern "C" fn v3_list_moves(len: i32) -> *const i32 {
    let (p, mut arena) = parse(&inbuf()[..len as usize]);
    let mut moves: Vec<Mv> = Vec::new();
    gen_moves(&p, &mut arena, &mut moves);
    let out = outbuf();
    out.clear();
    out.push(0); //placeholder for count
    let push_pos = |out: &mut Vec<i32>, a: P4, promo: i8| {
        if promo != 0 {
            out.push(5);
            out.extend_from_slice(&[a.l, a.t, a.r, a.f, promo as i32]);
        } else {
            out.push(4);
            out.extend_from_slice(&[a.l, a.t, a.r, a.f]);
        }
    };
    for mv in &moves {
        match mv.extra {
            Extra::None => {
                out.push(2);
                push_pos(out, mv.s, 0);
                push_pos(out, mv.d, mv.promo);
            }
            Extra::EnPassant(s2) => {
                out.push(3);
                push_pos(out, mv.s, 0);
                push_pos(out, mv.d, mv.promo);
                push_pos(out, s2, 0);
            }
            Extra::Castle(s2, d2) => {
                out.push(4);
                push_pos(out, mv.s, 0);
                push_pos(out, mv.d, 0);
                push_pos(out, s2, 0);
                push_pos(out, d2, 0);
            }
        }
    }
    let n = out.len() as i32 - 1;
    out[0] = n;
    out.as_ptr()
}
