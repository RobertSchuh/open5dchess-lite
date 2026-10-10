fn main() {
    let args: Vec<String> = std::env::args().collect();
    let bytes = std::fs::read(&args[1]).unwrap();
    let buf: Vec<i32> = bytes.chunks_exact(4).map(|c| i32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect();
    let reps: usize = args.get(2).map(|s| s.parse().unwrap()).unwrap_or(1);
    let t = std::time::Instant::now();
    open5d_engine::profile_classify(&buf, reps);
    println!("{} reps in {:?}", reps, t.elapsed());
}
