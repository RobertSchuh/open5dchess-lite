fn main() {
    let args: Vec<String> = std::env::args().collect();
    let bytes = std::fs::read(&args[1]).unwrap();
    let buf: Vec<i32> = bytes.chunks_exact(4).map(|c| i32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect();
    // profile <pos.bin> has_legal <budget_ms>   -> one long mate search (DFS)
    // profile <pos.bin> hc <budget_ms>          -> hypercuboid search
    // profile <pos.bin> [reps]                  -> classify timing harness
    if args.get(2).map(|s| s.as_str()) == Some("has_legal") {
        let budget: f64 = args.get(3).map(|s| s.parse().unwrap()).unwrap_or(60000.0);
        open5d_engine::profile_has_legal(&buf, budget);
        return;
    }
    if args.get(2).map(|s| s.as_str()) == Some("hc") {
        let budget: f64 = args.get(3).map(|s| s.parse().unwrap()).unwrap_or(60000.0);
        open5d_engine::hypercuboid::profile_has_legal_hc(&buf, budget);
        return;
    }
    let reps: usize = args.get(2).map(|s| s.parse().unwrap()).unwrap_or(1);
    let t = std::time::Instant::now();
    open5d_engine::profile_classify(&buf, reps);
    println!("{} reps in {:?}", reps, t.elapsed());
}
