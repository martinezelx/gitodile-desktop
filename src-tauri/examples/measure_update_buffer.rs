//! Reproduces the updater plugin's in-memory `Vec<u8>` retention model for
//! local, non-production artifact measurements. Pass one or more files; they
//! are streamed in 64 KiB chunks into one buffer and held for five seconds so
//! an external process monitor can capture peak working set.

use std::fs::File;
use std::io::{self, Read};
use std::time::Duration;

fn main() -> io::Result<()> {
    let mut retained = Vec::new();
    for path in std::env::args_os().skip(1) {
        let mut file = File::open(path)?;
        let mut chunk = [0_u8; 64 * 1024];
        loop {
            let read = file.read(&mut chunk)?;
            if read == 0 {
                break;
            }
            retained.extend_from_slice(&chunk[..read]);
        }
    }
    println!(
        "{{\"retainedBytes\":{},\"vecCapacityBytes\":{}}}",
        retained.len(),
        retained.capacity()
    );
    std::thread::sleep(Duration::from_secs(5));
    std::hint::black_box(&retained);
    Ok(())
}
