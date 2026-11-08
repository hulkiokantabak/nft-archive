# Provenance fingerprints, November 2026

`hashes_2026-11.csv` lists 3,111 files: our own copies of works whose original files live on a company's web server (not on IPFS,
Arweave or on chain). For each file it gives the work (collection, title, contract, token), the kind of file (record, image or
animation), the address it was originally served from, the IPFS CID of our copy, the copy's SHA-256 and size in bytes, and the date
we made the copy. The list was made on 8 November 2026.

**How to check a copy:** fetch the file by its CID from any IPFS gateway (for example `https://ipfs.io/ipfs/<our_cid>`), compute its
SHA-256 (`sha256sum` on Linux or macOS, `certutil -hashfile <file> SHA256` on Windows) and compare it with the `sha256` column. A
match shows the file is byte-for-byte the copy listed here on this date.

Where `source_note` says "OpenSea's stored copy" or "OpenSea's stored record", the original address no longer served the file when we
made our copy, so our copy is the one OpenSea had stored, not the original server's own bytes.
For some images and animations the address given is the token's record address (its metadata on the company's server), because the
file's own address was not kept when the copy was made; the record names the file.
