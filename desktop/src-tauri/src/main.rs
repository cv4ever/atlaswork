// Atlaswork on Windows (agents-design D77): the hosted app in a window that closes to the tray and starts at Windows
// sign-in, so agents can keep working on this computer. The hosted app reaches ten commands, from its own origin only
// (capabilities/app.json), or from this computer's dev server instead when settings.json names one (`dev_url`), for
// the dev-only ChatGPT plan: what this app knows (`desktop_info`), pairing this computer with a token the account issued
// (`pair`, kept in Windows Credential Manager, after a native confirmation a page can't click for you), forgetting it
// (`unpair`), linking a folder through Windows' own picker and unlinking it (`link_folder`, `unlink_folder`), turning
// search on or off and editing its list (`set_search`, `add_search_folder`, `remove_search_folder`, D78), turning
// tidying on or off (`set_tidy`, D79), and a notification (`notify`). Links to anywhere else open in the default
// browser. While this computer is paired, the helper (desktop/helper, a compiled Deno program beside this one) runs its
// jobs, opening only the folders linked here and, while search is on, the ones on its search list; for a request asked
// in this window it may ask, on its stdout, to show a file or folder it found, which this app checks again before
// opening it in its own app (D78). A tidy job's moves come the same way (D79): this app, never the helper, checks and
// makes them, and answers on the helper's stdin (tidy.rs). It updates itself between jobs (D85, update.rs).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod tidy;
mod update;

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::{ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, Url, Webview, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_notification::NotificationExt;

/// The hosted app. A debug build may load another (`ATLASWORK_URL`, a local Vite).
const APP_URL: &str = "https://app.atlaswork.app";
/// Where the computer's token lives in Windows Credential Manager.
const KEYRING_SERVICE: &str = "Atlaswork";
const KEYRING_USER: &str = "computer-token";
/// Pages the window may show itself: the app, and the sign-in pages it sends you through.
const SIGN_IN_HOSTS: [&str; 1] = ["accounts.google.com"];

#[derive(Clone, Serialize, Deserialize)]
struct Computer {
    id: String,
    name: String,
}

/// A folder linked on this computer: the id the workspace names it by (a project's `folder`), the name its paths start
/// with, and where it is. The helper opens only these, so a path in a workspace record never reaches the disk.
#[derive(Clone, Serialize, Deserialize)]
struct LocalFolder {
    #[serde(default)]
    id: String,
    name: String,
    path: String,
}

/// A folder on this computer's search list (agents-design D78): the name a match's path starts with, and where it is.
/// The list never leaves this computer.
#[derive(Clone, Serialize, Deserialize)]
struct SearchFolder {
    name: String,
    path: String,
}

/// What this app remembers between runs (`settings.json` in its config folder), never the token.
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Settings {
    /// The account's computer this install is, once paired.
    computer: Option<Computer>,
    /// The folders agents may read here; the only ones the helper opens, with the search list while search is on.
    folders: Vec<LocalFolder>,
    /// Agents may search this computer's search list (D78). Off keeps the list for next time.
    search: bool,
    /// Where a search looks, and nowhere else.
    search_folders: Vec<SearchFolder>,
    /// Agents may tidy this computer (D79): move and rename files a search found and make their folders in Documents.
    /// Only while search is on and Documents is on the list; losing either turns it off.
    tidy: bool,
    /// Start at sign-in was set once, on the first run; after that the tray's switch decides.
    autostart_chosen: bool,
    /// The first close said the app keeps working in the tray.
    told_tray: bool,
    /// The version an update is installing (D85), so the app it starts says it updated, once.
    updated_to: Option<String>,
    /// This computer's dev server, which the window loads instead of the hosted app while it answers (`dev_url`).
    /// Set by hand on Carlos's computer; the app never writes it.
    dev_url: Option<String>,
}

fn settings_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join("settings.json"))
}

fn load_settings(app: &AppHandle) -> Settings {
    settings_path(app)
        .and_then(|path| std::fs::read(path).ok())
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn save_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app).ok_or("This computer's settings folder can't be found.")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(settings).map_err(|error| error.to_string())?;
    std::fs::write(path, bytes).map_err(|error| error.to_string())
}

fn token_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|error| error.to_string())
}

fn start_url() -> Url {
    #[cfg(debug_assertions)]
    if let Some(url) = std::env::var("ATLASWORK_URL").ok().and_then(|url| Url::parse(&url).ok()) {
        return url;
    }
    Url::parse(APP_URL).expect("APP_URL is a URL")
}

/// The dev server `settings.devUrl` names, loopback only: there agents can answer on the computer's ChatGPT plan,
/// whose bridge only the dev server has (dev/chatgpt/README.md). The hosted app can't, until OpenAI approves it.
fn dev_url(settings: &Settings) -> Option<Url> {
    let url = Url::parse(settings.dev_url.as_deref()?).ok()?;
    (url.scheme() == "http" && matches!(url.host_str(), Some("127.0.0.1" | "localhost"))).then_some(url)
}

/// Whether something accepts connections at `url`'s address now.
fn answers(url: &Url) -> bool {
    url.socket_addrs(|| None).is_ok_and(|addrs| {
        addrs.iter().any(|addr| std::net::TcpStream::connect_timeout(addr, Duration::from_millis(300)).is_ok())
    })
}

/// Gives a page other than the hosted app the hosted app's commands: a local Vite in debug builds, or the dev server.
fn allow_commands(app: &tauri::App, name: &str, url: &Url) -> tauri::Result<()> {
    app.add_capability(
        tauri::ipc::CapabilityBuilder::new(name)
            .window("main")
            .remote(format!("{}/*", url.origin().ascii_serialization()))
            .permission("allow-desktop-info")
            .permission("allow-pair")
            .permission("allow-unpair")
            .permission("allow-link-folder")
            .permission("allow-unlink-folder")
            .permission("allow-set-search")
            .permission("allow-set-tidy")
            .permission("allow-add-search-folder")
            .permission("allow-remove-search-folder")
            .permission("allow-notify"),
    )
}

/// Whether the window may show `url` itself; anything else opens in the default browser.
fn stays_in_window(url: &Url, app: &Url) -> bool {
    url.origin() == app.origin()
        || url.scheme() == "about"
        || url.host_str().is_some_and(|host| SIGN_IN_HOSTS.contains(&host) || host.ends_with(".supabase.co"))
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = AsRef::<Webview>::as_ref(&window).show();
        let _ = window.set_focus();
    }
}

/// Hides the window and its page too: WebView2 otherwise tells a page in a hidden window it's on screen, and the app
/// would go on saying it's in view, so the server would leave your routines to a page nobody sees (D54).
fn hide_window(window: &WebviewWindow) {
    let _ = window.hide();
    let _ = AsRef::<Webview>::as_ref(window).hide();
}

/// The helper this app runs: which start is current, the pipe whose closing stops it, and whether one runs now.
#[derive(Default)]
struct Held {
    start: u64,
    stdin: Option<ChildStdin>,
    running: bool,
}
#[derive(Default)]
struct Helper(Mutex<Held>);

/// This start's window key (D78): a random secret only this app's own window learns (`desktop_info`) and sends with a
/// request asked there, so only such a request may show a file on this screen. The helper gets it too, to check first.
struct WindowKey(String);

fn window_key() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("Windows gives random bytes");
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// The helper's settings line on its stdin: the token never goes on a command line, where other programs can read it.
/// The app's version goes with it, for the helper's polls to record on this computer's row (D85).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HelperSettings<'a> {
    token: &'a str,
    supabase_url: String,
    publishable_key: String,
    folders: &'a [LocalFolder],
    search: &'a [SearchFolder],
    window_key: &'a str,
    version: String,
}

/// How long a helper that stopped by itself waits before it starts again.
const HELPER_RESTART: Duration = Duration::from_secs(30);
/// The helper's exit code when the account no longer knows this computer's token.
const HELPER_REMOVED: i32 = 3;
/// The helper's log keeps what happened, never what was asked; past this size a start begins it afresh.
const HELPER_LOG_BYTES: u64 = 1_000_000;

/// The project the helper reaches: the hosted one (build.rs reads it from .env.production), which a debug build may
/// swap for a local stack.
fn backend() -> (String, String) {
    #[cfg(debug_assertions)]
    if let (Ok(url), Ok(key)) = (std::env::var("ATLASWORK_SUPABASE_URL"), std::env::var("ATLASWORK_SUPABASE_KEY")) {
        return (url, key);
    }
    (env!("ATLASWORK_HOSTED_SUPABASE_URL").into(), env!("ATLASWORK_HOSTED_SUPABASE_KEY").into())
}

fn with_helper<T>(app: &AppHandle, act: impl FnOnce(&mut Held) -> T) -> T {
    let state = app.state::<Helper>();
    let mut held = state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    act(&mut held)
}

/// Stops the helper if one runs (closing its stdin ends it) and makes any earlier start's supervisor stop too.
fn stop_helper(app: &AppHandle) -> u64 {
    with_helper(app, |held| {
        held.start += 1;
        held.stdin = None;
        held.start
    })
}

/// Asks the helper to stop once it holds no work, so the app can update (D85), and keeps it from starting again; its
/// stdin stays open meanwhile, so a tidy it holds still hears what the app did. Whether one still runs is `running`.
fn finish_helper(app: &AppHandle) {
    with_helper(app, |held| {
        held.start += 1;
        if let Some(stdin) = held.stdin.as_mut() {
            let _ = writeln!(stdin, "{}", serde_json::json!({ "finish": true }));
        }
    });
}

/// Starts the helper when this computer is paired, in place of one already running.
fn start_helper(app: &AppHandle) {
    let start = stop_helper(app);
    let settings = load_settings(app);
    let Some(token) = settings.computer.as_ref().and_then(|_| token_entry().ok()?.get_password().ok()) else {
        return;
    };
    let app = app.clone();
    std::thread::spawn(move || supervise(app, start, token));
}

/// The helper's working folder, the only one it may write in: its search index and the index's `status.json` (D78).
fn search_dir(app: &AppHandle) -> std::io::Result<std::path::PathBuf> {
    Ok(app.path().app_local_data_dir().map_err(std::io::Error::other)?.join("search"))
}

/// Starts the helper with the folders linked now; the caller holds the helper's lock, so no change is lost between.
fn spawn_helper(app: &AppHandle, token: &str) -> std::io::Result<std::process::Child> {
    let program = std::env::current_exe()?.with_file_name("atlaswork-helper.exe");
    let logs = app.path().app_log_dir().map_err(std::io::Error::other)?;
    std::fs::create_dir_all(&logs)?;
    let path = logs.join("helper.log");
    let full = std::fs::metadata(&path).is_ok_and(|meta| meta.len() > HELPER_LOG_BYTES);
    let log = std::fs::OpenOptions::new().create(true).append(!full).write(true).truncate(full).open(path)?;
    let work = search_dir(app)?;
    std::fs::create_dir_all(&work)?;
    let mut command = Command::new(program);
    command.current_dir(work).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(log);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // No console window flashes up for it.
        command.creation_flags(0x0800_0000);
    }
    let mut child = command.spawn()?;
    let (supabase_url, publishable_key) = backend();
    let settings = load_settings(app);
    let line = serde_json::to_string(&HelperSettings {
        token,
        supabase_url,
        publishable_key,
        folders: &settings.folders,
        search: searched(&settings),
        window_key: &app.state::<WindowKey>().0,
        version: app.package_info().version.to_string(),
    })?;
    if let Err(error) = child.stdin.as_mut().map_or(Ok(()), |stdin| writeln!(stdin, "{line}")) {
        let _ = child.kill();
        return Err(error);
    }
    if let Some(stdout) = child.stdout.take() {
        let app = app.clone();
        std::thread::spawn(move || hear_helper(&app, stdout));
    }
    Ok(child)
}

/// What a helper asks of this app on its stdout: to show a file or folder a reply found, for a request asked in this
/// app's window (D78), or to make a tidy job's moves, or put them back (D79).
#[derive(Deserialize)]
struct HelperAsk {
    show: Option<Shown>,
    tidy: Option<tidy::Order>,
}
#[derive(Deserialize)]
struct Shown {
    key: String,
    path: String,
}

/// File types a reply may show on this screen (D78): documents and images, besides folders, never a program, script,
/// shortcut or web page. This list decides, not the model; the helper checks the same one first.
const SHOWN_TYPES: [&str; 25] = [
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "txt", "md", "csv", "jpg", "jpeg", "png", "gif",
    "webp", "bmp", "heic", "tif", "tiff", "avif", "svg",
];

/// Does what the helper asks, after checking it again: shows a file, dropping an ask that fails the checks, or makes a
/// tidy's moves and tells the helper what it did.
fn hear_helper(app: &AppHandle, stdout: ChildStdout) {
    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
        let Ok(ask) = serde_json::from_str::<HelperAsk>(&line) else { continue };
        if let Some(order) = ask.tidy {
            let Ok(answer) = serde_json::to_string(&serde_json::json!({ "tidied": tidy_here(app, order) })) else { continue };
            let _ = with_helper(app, |held| held.stdin.as_mut().map(|stdin| writeln!(stdin, "{answer}")));
            continue;
        }
        let Some(show) = ask.show else { continue };
        if show.key != app.state::<WindowKey>().0 {
            continue;
        }
        let settings = load_settings(app);
        let roots: Vec<&str> = settings.folders.iter().map(|folder| folder.path.as_str())
            .chain(searched(&settings).iter().map(|folder| folder.path.as_str())).collect();
        let Ok(path) = showable(&show.path, &roots) else { continue };
        // A debug build checked from a script says what it would show instead of putting a window on the screen.
        #[cfg(debug_assertions)]
        if std::env::var("ATLASWORK_SHOW_DRY_RUN").is_ok() {
            println!("would show {}", path.display());
            continue;
        }
        let _ = tauri_plugin_opener::open_path(path, None::<&str>);
    }
}

/// Makes a tidy job's moves here, or puts them back (D79): only while tidying is on, which needs search on and
/// Documents on the list, and only in the folders on that list. What moved is kept in `tidy.json` beside the settings.
fn tidy_here(app: &AppHandle, order: tidy::Order) -> tidy::Outcome {
    let settings = load_settings(app);
    let documents = documents(app);
    let log = tidy_log(app);
    let listed = |documents: &String| settings.tidy && documents_listed(Some(documents.as_str()), searched(&settings));
    let (Some(documents), Some(log)) = (documents.filter(listed), log) else {
        return tidy::Outcome::Failed { job: order.job, failed: "Tidying is off on this computer. Turn it on in its Atlaswork window.".into() };
    };
    let here = tidy::Here {
        folders: searched(&settings).iter().map(|folder| (folder.name.clone(), std::path::PathBuf::from(&folder.path))).collect(),
        documents: documents.into(),
    };
    let mut kept = tidy::load(&log);
    let outcome = tidy::run(order, &here, &mut kept);
    if let Err(error) = tidy::save(&log, &kept) {
        eprintln!("what the tidy moved couldn't be kept: {error}");
    }
    outcome
}

/// A canonical path without Windows' long-path prefix, which apps opening a file may not take.
fn plain(real: &std::path::Path) -> std::path::PathBuf {
    let text = real.to_string_lossy();
    std::path::PathBuf::from(match text.strip_prefix(r"\\?\UNC\") {
        Some(share) => format!(r"\\{share}"),
        None => text.trim_start_matches(r"\\?\").to_string(),
    })
}

/// `path` as this screen may show it: a document, an image or a folder that really is inside one of `roots`, with
/// links and `..` resolved, and outside Windows', programs' and apps' own folders. Why not, when it may not.
fn showable(path: &str, roots: &[&str]) -> Result<std::path::PathBuf, &'static str> {
    let real = std::fs::canonicalize(path).map_err(|_| "it isn't there")?;
    if !roots.iter().filter_map(|root| std::fs::canonicalize(root).ok()).any(|root| real.starts_with(root)) {
        return Err("it isn't in a folder agents may read");
    }
    let plain = plain(&real);
    if system_folder(&plain.to_string_lossy()) {
        return Err("it's among Windows', programs' or apps' own files");
    }
    let typed = plain.extension().and_then(|kind| kind.to_str()).is_some_and(|kind| SHOWN_TYPES.contains(&kind.to_ascii_lowercase().as_str()));
    if !plain.is_dir() && !typed {
        return Err("it isn't a document, an image or a folder");
    }
    Ok(plain)
}

/// Keeps one start's helper running until a newer start or a stop replaces it, starting it again after it stopped by
/// itself; when the account no longer knows this computer, forgets the pairing and says so.
fn supervise(app: AppHandle, start: u64, token: String) {
    let current = |app: &AppHandle| with_helper(app, |held| held.start) == start;
    loop {
        let spawned = with_helper(&app, |held| {
            if held.start != start {
                return None;
            }
            Some(spawn_helper(&app, &token).map(|mut child| {
                held.stdin = child.stdin.take();
                held.running = true;
                child
            }))
        });
        match spawned {
            None => return,
            Some(Ok(mut child)) => {
                let code = child.wait().ok().and_then(|status| status.code());
                with_helper(&app, |held| held.running = false);
                if !current(&app) {
                    return;
                }
                if code == Some(HELPER_REMOVED) {
                    let _ = forget(&app);
                    let _ = app
                        .notification()
                        .builder()
                        .title("Agents no longer work on this computer")
                        .body("It was removed from your Atlaswork account. Pair it again in Settings \u{2192} Account.")
                        .show();
                    return;
                }
            }
            Some(Err(error)) => eprintln!("the helper couldn't start: {error}"),
        }
        std::thread::sleep(HELPER_RESTART);
        if !current(&app) {
            return;
        }
    }
}

/// The search list the helper may look in: none while search is off.
fn searched(settings: &Settings) -> &[SearchFolder] {
    if settings.search {
        &settings.search_folders
    } else {
        &[]
    }
}

/// Changes this computer's settings and tells a running helper what it may open now, under its lock, so a start never
/// misses a change. Returns the settings as changed.
fn change_settings(app: &AppHandle, change: impl FnOnce(&mut Settings) -> Result<(), String>) -> Result<Settings, String> {
    with_helper(app, |held| {
        let mut settings = load_settings(app);
        change(&mut settings)?;
        // Tidying needs search on and Documents on the list (D79): a change that ends either turns it off.
        settings.tidy &= settings.search && documents_listed(documents(app).as_deref(), &settings.search_folders);
        save_settings(app, &settings)?;
        if let Some(stdin) = held.stdin.as_mut() {
            let _ = writeln!(stdin, "{}", serde_json::json!({ "folders": settings.folders, "search": searched(&settings) }));
        }
        Ok(settings)
    })
}

/// A folder id as the page makes them (`crypto.randomUUID()`).
fn is_id(id: &str) -> bool {
    id.len() == 36 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

/// Where this app keeps what its tidies moved, for Undo (D79): `tidy.json` beside its settings.
fn tidy_log(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join("tidy.json"))
}

/// Forgets this computer's token and pairing, stops its helper and deletes its search index and what its tidies moved,
/// since no Undo can reach it any more.
fn forget(app: &AppHandle) -> Result<(), String> {
    stop_helper(app);
    match token_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(error) => return Err(error.to_string()),
    }
    let mut settings = load_settings(app);
    settings.computer = None;
    settings.search = false;
    settings.tidy = false;
    save_settings(app, &settings)?;
    if let Some(log) = tidy_log(app) {
        let _ = std::fs::remove_file(log);
    }
    // The helper holds the index open until it has stopped, which takes a moment after its stdin closes.
    if let Ok(dir) = search_dir(app) {
        std::thread::spawn(move || {
            for _ in 0..20 {
                match std::fs::remove_dir_all(&dir) {
                    Err(error) if error.kind() != std::io::ErrorKind::NotFound => std::thread::sleep(Duration::from_millis(500)),
                    _ => return,
                }
            }
        });
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopInfo {
    version: String,
    /// Windows' name for this computer, which the app may offer as the computer's name.
    device_name: String,
    /// The account's computer this install is, when it's paired and its token is still here.
    computer: Option<Computer>,
    search: SearchInfo,
    /// This start's window key (D78), which the page sends with a request asked here.
    window_key: String,
}

/// This computer's search (D78) as the page shows it: whether it's on, its list, and the usual folders not on it yet.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchInfo {
    on: bool,
    folders: Vec<SearchFolder>,
    offered: Vec<SearchFolder>,
    /// Agents may tidy here (D79), and whether Documents, where they make their folders, is on the list.
    tidy: bool,
    documents: bool,
    /// How much the helper's index holds while search is on, as the helper last wrote it.
    index: Option<IndexStatus>,
}

/// How much the search index holds: desktop/helper/search.ts writes it to `status.json` beside the index.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IndexStatus {
    files: u64,
    texts: u64,
    reading: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    at: Option<String>,
    #[serde(default)]
    full: bool,
}

/// Whether `inner` is `outer` or inside it, as Windows compares paths, without case.
fn within(inner: &str, outer: &str) -> bool {
    let (inner, outer) = (inner.trim_end_matches(['\\', '/']).to_lowercase(), outer.trim_end_matches(['\\', '/']).to_lowercase());
    inner == outer || inner.starts_with(&format!("{outer}\\"))
}

/// This computer's Documents, where agents make their folders when they tidy (D79). A debug build takes
/// `ATLASWORK_DOCUMENTS` instead when it's set, so a check searches and tidies a test folder, never the real one.
fn documents(app: &AppHandle) -> Option<String> {
    #[cfg(debug_assertions)]
    if let Ok(path) = std::env::var("ATLASWORK_DOCUMENTS") {
        return Some(path);
    }
    app.path().document_dir().ok().map(|path| path.to_string_lossy().into_owned())
}

/// Whether Documents is on the search list, itself or inside a listed folder.
fn documents_listed(documents: Option<&str>, folders: &[SearchFolder]) -> bool {
    documents.is_some_and(|documents| folders.iter().any(|folder| within(documents, &folder.path)))
}

/// Documents, Desktop, Downloads, Pictures and OneDrive, where Windows keeps them here, offered to add in one tap.
fn usual_folders(app: &AppHandle) -> Vec<SearchFolder> {
    let paths = app.path();
    let known = [
        ("Documents", documents(app)),
        ("Desktop", paths.desktop_dir().ok().map(|path| path.to_string_lossy().into_owned())),
        ("Downloads", paths.download_dir().ok().map(|path| path.to_string_lossy().into_owned())),
        ("Pictures", paths.picture_dir().ok().map(|path| path.to_string_lossy().into_owned())),
    ];
    let mut usual: Vec<SearchFolder> = known
        .into_iter()
        .filter_map(|(name, path)| Some(SearchFolder { name: name.into(), path: path? }))
        .collect();
    if let Ok(path) = std::env::var("OneDrive") {
        usual.push(SearchFolder { name: "OneDrive".into(), path });
    }
    usual.retain(|folder| std::path::Path::new(&folder.path).is_dir());
    usual
}

/// Windows', programs' and apps' own folders, where settings and sign-ins live: no search looks in them.
fn system_folder(path: &str) -> bool {
    let profile = std::env::var("USERPROFILE").map(|home| format!("{home}\\AppData"));
    ["windir", "ProgramFiles", "ProgramFiles(x86)", "ProgramData"]
        .iter()
        .filter_map(|name| std::env::var(name).ok())
        .chain(profile)
        .any(|system| within(path, &system))
}

fn search_info(app: &AppHandle, settings: &Settings) -> SearchInfo {
    let listed = |path: &str| settings.search_folders.iter().any(|folder| within(path, &folder.path));
    let index = settings
        .search
        .then(|| std::fs::read_to_string(search_dir(app).ok()?.join("status.json")).ok())
        .flatten()
        .and_then(|text| serde_json::from_str(&text).ok());
    SearchInfo {
        on: settings.search,
        folders: settings.search_folders.clone(),
        offered: usual_folders(app).into_iter().filter(|folder| !listed(&folder.path)).collect(),
        tidy: settings.tidy,
        documents: documents_listed(documents(app).as_deref(), &settings.search_folders),
        index,
    }
}

#[tauri::command]
fn desktop_info(app: AppHandle) -> DesktopInfo {
    let paired = token_entry().and_then(|entry| entry.get_password().map_err(|error| error.to_string())).is_ok();
    let settings = load_settings(&app);
    DesktopInfo {
        version: app.package_info().version.to_string(),
        device_name: std::env::var("COMPUTERNAME").unwrap_or_default(),
        search: search_info(&app, &settings),
        computer: if paired { settings.computer } else { None },
        window_key: app.state::<WindowKey>().0.clone(),
    }
}

/// Keeps the token the account issued for this computer, once the person confirms in a native dialog: a page that
/// went wrong could otherwise pair this computer with someone else's account.
#[tauri::command]
async fn pair(app: AppHandle, id: String, name: String, token: String) -> Result<(), String> {
    let well_formed = id.len() == 36 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
        && (1..=80).contains(&name.chars().count())
        && token.starts_with("awc_") && (40..=100).contains(&token.len())
        && token.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    if !well_formed {
        return Err("That isn't a computer this app can pair with.".into());
    }
    let confirmed = app
        .dialog()
        .message(format!(
            "Agents in your Atlaswork account will work here as \u{201c}{name}\u{201d}. They reach only the folders you link on this \
             computer, and you can remove it any time in Settings \u{2192} Account."
        ))
        .title("Let agents work on this computer?")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom("Let them work here".into(), "Not now".into()))
        .blocking_show();
    if !confirmed {
        return Err("Not now".into());
    }
    token_entry()?.set_password(&token).map_err(|error| error.to_string())?;
    let mut settings = load_settings(&app);
    settings.computer = Some(Computer { id, name });
    save_settings(&app, &settings)?;
    start_helper(&app);
    Ok(())
}

/// Forgets this computer's token, after it was removed from the account here or elsewhere.
#[tauri::command]
fn unpair(app: AppHandle) -> Result<(), String> {
    forget(&app)
}

/// Asks for a folder in Windows' own picker and keeps it as `id`, in place of `replaces`, telling the helper; None when
/// the person cancels. The page names it in the workspace by `id`; only this computer's list says where it is.
#[tauri::command]
async fn link_folder(app: AppHandle, id: String, replaces: Option<String>) -> Result<Option<LocalFolder>, String> {
    if !is_id(&id) || replaces.as_deref().is_some_and(|replaced| !is_id(replaced)) {
        return Err("That isn't a folder this app can link.".into());
    }
    let mut picker = app.dialog().file().set_title("Choose a folder agents may read");
    if let Some(window) = app.get_webview_window("main") {
        picker = picker.set_parent(&window);
    }
    let Some(picked) = picker.blocking_pick_folder() else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|error| error.to_string())?;
    // A drive's root has no name of its own, so its paths start with "Folder".
    let name = path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_else(|| "Folder".into());
    let folder = LocalFolder { id, name, path: path.to_string_lossy().into_owned() };
    let kept = folder.clone();
    change_settings(&app, move |settings| {
        settings.folders.retain(|item| item.id != kept.id && Some(&item.id) != replaces.as_ref());
        settings.folders.push(kept);
        Ok(())
    })?;
    Ok(Some(folder))
}

/// Forgets a folder linked on this computer, so the helper no longer opens it.
#[tauri::command]
fn unlink_folder(app: AppHandle, id: String) -> Result<(), String> {
    change_settings(&app, |settings| {
        settings.folders.retain(|item| item.id != id);
        Ok(())
    })?;
    Ok(())
}

/// Turns this computer's search on or off here (D78); the page tells the account too. On needs a paired computer.
#[tauri::command]
fn set_search(app: AppHandle, on: bool) -> Result<SearchInfo, String> {
    let settings = change_settings(&app, |settings| {
        if on && settings.computer.is_none() {
            return Err("Let agents work on this computer first.".into());
        }
        settings.search = on;
        Ok(())
    })?;
    Ok(search_info(&app, &settings))
}

/// Turns this computer's tidying on or off here (D79); the page tells the account too. On needs search on here and
/// Documents on the list, where agents make their folders.
#[tauri::command]
fn set_tidy(app: AppHandle, on: bool) -> Result<SearchInfo, String> {
    let documents = documents(&app);
    let settings = change_settings(&app, |settings| {
        if on && (settings.computer.is_none() || !settings.search) {
            return Err("Turn on search here first.".into());
        }
        if on && !documents_listed(documents.as_deref(), &settings.search_folders) {
            return Err("Add Documents to the list first: that's where agents make their folders.".into());
        }
        settings.tidy = on;
        Ok(())
    })?;
    Ok(search_info(&app, &settings))
}

/// Adds a folder to the search list: a usual one it offered, by its path, or else one the person picks in Windows' own
/// picker. A folder holding listed ones takes their place; one inside a listed folder, or among Windows', programs' or
/// apps' own, is refused. None when the person cancels.
#[tauri::command]
async fn add_search_folder(app: AppHandle, path: Option<String>) -> Result<Option<SearchInfo>, String> {
    let folder = match path {
        Some(path) => usual_folders(&app)
            .into_iter()
            .find(|folder| folder.path == path)
            .ok_or_else(|| "That isn't a folder this app offered.".to_string())?,
        None => {
            let mut picker = app.dialog().file().set_title("Choose a folder agents may search");
            if let Some(window) = app.get_webview_window("main") {
                picker = picker.set_parent(&window);
            }
            let Some(picked) = picker.blocking_pick_folder() else {
                return Ok(None);
            };
            let path = picked.into_path().map_err(|error| error.to_string())?;
            let name = path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_else(|| "Folder".into());
            SearchFolder { name, path: path.to_string_lossy().into_owned() }
        }
    };
    if system_folder(&folder.path) {
        return Err("Agents can't search Windows', programs' or apps' own folders.".into());
    }
    let settings = change_settings(&app, move |settings| {
        if let Some(outer) = settings.search_folders.iter().find(|listed| within(&folder.path, &listed.path)) {
            return Err(format!("That's already searched, in {}.", outer.name));
        }
        settings.search_folders.retain(|listed| !within(&listed.path, &folder.path));
        // Matches start with the folder's name, so two folders never share one.
        let taken = |name: &str| settings.search_folders.iter().any(|listed| listed.name.eq_ignore_ascii_case(name));
        let name = (1..).map(|n| if n == 1 { folder.name.clone() } else { format!("{} {n}", folder.name) }).find(|name| !taken(name));
        settings.search_folders.push(SearchFolder { name: name.unwrap_or_default(), path: folder.path });
        Ok(())
    })?;
    Ok(Some(search_info(&app, &settings)))
}

/// Takes a folder off the search list, so no search looks there any more.
#[tauri::command]
fn remove_search_folder(app: AppHandle, path: String) -> Result<SearchInfo, String> {
    let settings = change_settings(&app, |settings| {
        settings.search_folders.retain(|listed| listed.path != path);
        Ok(())
    })?;
    Ok(search_info(&app, &settings))
}

#[tauri::command]
fn notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    let cut = |text: &str, most: usize| text.chars().take(most).collect::<String>();
    app.notification().builder().title(cut(&title, 80)).body(cut(&body, 200)).show().map_err(|error| error.to_string())
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Atlaswork", true, None::<&str>)?;
    let starts = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart = CheckMenuItem::with_id(app, "autostart", "Start when Windows starts", true, starts, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Atlaswork", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &autostart, &PredefinedMenuItem::separator(app)?, &quit])?;
    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().expect("the bundle has an icon"))
        .tooltip("Atlaswork")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_window(tray.app_handle());
            }
        })
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "open" => show_window(app),
            "autostart" => {
                let launcher = app.autolaunch();
                let on = launcher.is_enabled().unwrap_or(false);
                let _ = if on { launcher.disable() } else { launcher.enable() };
                let _ = autostart.set_checked(launcher.is_enabled().unwrap_or(!on));
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

fn main() {
    let hidden = std::env::args().any(|arg| arg == "--hidden");
    tauri::Builder::default()
        // First, so a second launch shows this one instead of starting another.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_window(app)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Helper::default())
        .manage(WindowKey(window_key()))
        .invoke_handler(tauri::generate_handler![
            desktop_info,
            pair,
            unpair,
            link_folder,
            unlink_folder,
            set_search,
            set_tidy,
            add_search_folder,
            remove_search_folder,
            notify
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            let mut settings = load_settings(&handle);
            // The app starts at Windows sign-in from its first run (agents-design D77); the tray turns it off.
            if !settings.autostart_chosen {
                let _ = handle.autolaunch().enable();
                settings.autostart_chosen = true;
                let _ = save_settings(&handle, &settings);
            }
            let hosted = start_url();
            #[cfg(debug_assertions)]
            if hosted.as_str() != Url::parse(APP_URL).expect("APP_URL is a URL").as_str() {
                // A local app gets the same commands as the hosted one, in debug builds only.
                allow_commands(app, "local-app", &hosted)?;
            }
            let dev = dev_url(&settings);
            if let Some(dev) = &dev {
                allow_commands(app, "dev-server", dev)?;
            }
            let url = dev.clone().filter(answers).unwrap_or_else(|| hosted.clone());
            let on_dev = url != hosted;
            let allowed = dev.clone();
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Atlaswork")
                .inner_size(1280.0, 840.0)
                .min_inner_size(400.0, 560.0)
                .visible(!hidden)
                .on_navigation(move |to| {
                    if stays_in_window(to, &hosted) || allowed.as_ref().is_some_and(|dev| stays_in_window(to, dev)) {
                        return true;
                    }
                    let _ = tauri_plugin_opener::open_url(to.as_str(), None::<&str>);
                    false
                })
                .on_new_window(|to, _features| {
                    let _ = tauri_plugin_opener::open_url(to.as_str(), None::<&str>);
                    NewWindowResponse::Deny
                })
                .build()?;
            // Started before the dev server (at Windows sign-in), it moves there once the server answers, but only
            // while the window is hidden, so nothing being typed in the hosted app is lost.
            if let (Some(dev), false) = (dev, on_dev) {
                let window = window.clone();
                std::thread::spawn(move || loop {
                    std::thread::sleep(Duration::from_secs(10));
                    if !window.is_visible().unwrap_or(true) && answers(&dev) {
                        let _ = window.navigate(dev);
                        break;
                    }
                });
            }
            if hidden {
                hide_window(&window);
            }
            build_tray(&handle)?;
            update::announce(&handle);
            // A paired computer's jobs run from the app's start, with the window open or not.
            start_helper(&handle);
            update::watch(&handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing keeps the app in the tray, where it goes on working; Quit is in the tray's menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if let Some(window) = window.app_handle().get_webview_window(window.label()) {
                    hide_window(&window);
                }
                let app = window.app_handle();
                let mut settings = load_settings(app);
                if !settings.told_tray {
                    let _ = app
                        .notification()
                        .builder()
                        .title("Atlaswork is still here")
                        .body("It keeps working in the tray. Right-click its icon to quit.")
                        .show();
                    settings.told_tray = true;
                    let _ = save_settings(app, &settings);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Atlaswork couldn't start");
}

#[cfg(test)]
mod tests {
    use super::{dev_url, documents_listed, showable, SearchFolder, Settings};

    #[test]
    fn loads_only_a_dev_server_on_this_computer() {
        let named = |url: &str| dev_url(&Settings { dev_url: Some(url.into()), ..Settings::default() }).is_some();
        assert!(named("http://127.0.0.1:5191/"));
        assert!(named("http://localhost:5191/"));
        assert!(!named("https://drdoom.tail15279.ts.net:5191/"));
        assert!(!named("http://192.168.1.5:5191/"));
        assert!(!named("file:///C:/app.html"));
        assert!(dev_url(&Settings::default()).is_none());
    }

    #[test]
    fn shows_only_documents_images_and_folders_really_inside_a_listed_folder() {
        // Inside this crate's target folder, which is outside Windows', programs' and apps' own folders.
        let base = std::env::current_dir().unwrap().join("target").join("show-test");
        let listed = base.join("Papers");
        std::fs::create_dir_all(listed.join("Banco")).unwrap();
        std::fs::create_dir_all(base.join("Elsewhere")).unwrap();
        for (path, text) in [("Papers/Banco/carta.pdf", "%PDF"), ("Papers/Banco/Carta.DOCX", "PK"), ("Papers/run.exe", "MZ"),
            ("Papers/start.lnk", "L"), ("Elsewhere/secret.pdf", "%PDF")] {
            std::fs::write(base.join(path), text).unwrap();
        }
        let root = listed.to_string_lossy().to_string();
        let roots = [root.as_str()];
        let at = |path: &str| showable(&base.join(path).to_string_lossy(), &roots);
        let real = std::fs::canonicalize(base.join("Papers/Banco/carta.pdf")).unwrap();
        assert_eq!(at("Papers/Banco/carta.pdf").unwrap(), std::path::PathBuf::from(real.to_string_lossy().trim_start_matches(r"\\?\")),
            "a document, by its real path");
        assert!(at("Papers/Banco/Carta.DOCX").is_ok(), "whatever the case of its type");
        assert!(at("Papers/Banco").is_ok(), "and the folder holding it");
        assert_eq!(at("Papers/run.exe"), Err("it isn't a document, an image or a folder"), "never a program");
        assert_eq!(at("Papers/start.lnk"), Err("it isn't a document, an image or a folder"), "nor a shortcut");
        assert_eq!(at("Elsewhere/secret.pdf"), Err("it isn't in a folder agents may read"), "nor a file outside the list");
        assert_eq!(at("Papers/../Elsewhere/secret.pdf"), Err("it isn't in a folder agents may read"), "even by way of ..");
        assert_eq!(at("Papers/missing.pdf"), Err("it isn't there"));
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn documents_counts_as_listed_itself_or_inside_a_listed_folder() {
        let folder = |path: &str| SearchFolder { name: "x".into(), path: path.into() };
        let documents = Some(r"C:\Users\Ana\Documents");
        assert!(documents_listed(documents, &[folder(r"C:\Users\Ana\Documents")]), "itself");
        assert!(documents_listed(documents, &[folder(r"c:\users\ana\")]), "inside a listed folder, whatever the case");
        assert!(!documents_listed(documents, &[folder(r"C:\Users\Ana\Documents\Bank")]), "not when only a folder inside it is");
        assert!(!documents_listed(documents, &[folder(r"C:\Users\Ana\Documents Old")]), "nor one whose name only starts the same");
        assert!(!documents_listed(None, &[folder(r"C:\")]), "and nowhere when Windows has no Documents here");
    }
}
