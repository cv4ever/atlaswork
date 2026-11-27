// The app's own commands, so capabilities/app.json can grant them to the hosted app's origin by name, and the hosted
// project the helper reaches, read from the web app's production settings so the two never disagree.
fn main() {
    let env = std::fs::read_to_string("../../.env.production").expect("the web app's .env.production is readable");
    let value = |name: &str| {
        env.lines()
            .find_map(|line| line.strip_prefix(name)?.strip_prefix('=').map(str::trim))
            .unwrap_or_else(|| panic!(".env.production sets {name}"))
            .to_string()
    };
    println!("cargo:rerun-if-changed=../../.env.production");
    println!("cargo:rustc-env=ATLASWORK_HOSTED_SUPABASE_URL={}", value("VITE_SUPABASE_URL"));
    println!("cargo:rustc-env=ATLASWORK_HOSTED_SUPABASE_KEY={}", value("VITE_SUPABASE_PUBLISHABLE_KEY"));
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "desktop_info",
            "pair",
            "unpair",
            "link_folder",
            "unlink_folder",
            "set_search",
            "set_tidy",
            "add_search_folder",
            "remove_search_folder",
            "notify",
        ]),
    ))
    .expect("the Tauri build step failed");
}
