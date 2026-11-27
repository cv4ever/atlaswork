//! The app updates itself (agents-design D85). Tauri's updater reads the published `latest.json` 30 s after the app
//! starts and every hour after; an update signed with the app's update key downloads in the background (the updater
//! refuses any other) and installs only when it disturbs nobody: with the window closed, after the helper finished
//! the work it holds. The installer runs with no window and starts the app again hidden, which says it updated.
//! What happened goes to `updates.log` beside the helper's log, never anything asked or found.
use std::io::Write;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::{Update, UpdaterExt};

const FIRST_CHECK: Duration = Duration::from_secs(30);
const CHECK_EVERY: Duration = Duration::from_secs(60 * 60);
/// How often a downloaded update looks again whether the window closed or the helper finished.
const WAIT_STEP: Duration = Duration::from_secs(2);
/// Longer than any job a computer runs (a hand-off's 10 minutes): past it the helper keeps its job and the update
/// waits for the next check, rather than cut a job short.
const FINISH_LIMIT: Duration = Duration::from_secs(15 * 60);
/// Past this size the log begins afresh.
const LOG_BYTES: u64 = 200_000;

/// Checks for updates for as long as the app runs. A debug build checks only when `ATLASWORK_UPDATES` is set, with
/// the endpoint and key its build merged in (`TAURI_CONFIG`), so a check script never installs a release over it.
pub fn watch(app: &AppHandle) {
    #[cfg(debug_assertions)]
    if std::env::var("ATLASWORK_UPDATES").is_err() {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK);
        loop {
            match tauri::async_runtime::block_on(fetch(&app)) {
                Ok(Some((update, bytes))) => install(&app, &update, bytes),
                Ok(None) => {}
                Err(error) => log(&app, &format!("couldn't check for an update: {error}")),
            }
            std::thread::sleep(CHECK_EVERY);
        }
    });
}

/// The published update, downloaded and its signature checked, or none when this is the newest.
async fn fetch(app: &AppHandle) -> tauri_plugin_updater::Result<Option<(Update, Vec<u8>)>> {
    // The installer starts the app again with this start's arguments and these after them: hidden, as at sign-in,
    // since it only installs while the window is closed.
    let Some(update) = app.updater_builder().installer_arg("--hidden").build()?.check().await? else {
        return Ok(None);
    };
    log(app, &format!("downloading {}", update.version));
    let bytes = update.download(|_, _| {}, || {}).await?;
    Ok(Some((update, bytes)))
}

fn window_open(app: &AppHandle) -> bool {
    app.get_webview_window("main").and_then(|window| window.is_visible().ok()).unwrap_or(false)
}

fn helper_running(app: &AppHandle) -> bool {
    super::with_helper(app, |held| held.running)
}

/// Installs once the window is closed and the helper has finished; the installer ends this process. When the helper
/// holds its job past `FINISH_LIMIT`, or the window opens meanwhile, the helper goes on and the next check tries again.
fn install(app: &AppHandle, update: &Update, bytes: Vec<u8>) {
    while window_open(app) {
        std::thread::sleep(WAIT_STEP);
    }
    super::finish_helper(app);
    let asked = Instant::now();
    while helper_running(app) {
        if asked.elapsed() > FINISH_LIMIT {
            log(app, &format!("{} waits: the helper still holds its work", update.version));
            super::start_helper(app);
            return;
        }
        std::thread::sleep(WAIT_STEP);
    }
    if window_open(app) {
        log(app, &format!("{} waits: the window opened", update.version));
        super::start_helper(app);
        return;
    }
    let mut settings = super::load_settings(app);
    settings.updated_to = Some(update.version.clone());
    let _ = super::save_settings(app, &settings);
    log(app, &format!("installing {}", update.version));
    if let Err(error) = update.install(bytes) {
        log(app, &format!("{} couldn't install: {error}", update.version));
        settings.updated_to = None;
        let _ = super::save_settings(app, &settings);
        super::start_helper(app);
    }
}

/// After an update the app says so once, and the log says whether the version it installed is the one running.
pub fn announce(app: &AppHandle) {
    let mut settings = super::load_settings(app);
    let Some(to) = settings.updated_to.take() else { return };
    let _ = super::save_settings(app, &settings);
    let now = app.package_info().version.to_string();
    if to != now {
        log(app, &format!("the update to {to} didn't install; this is {now}"));
        return;
    }
    log(app, &format!("updated to {now}"));
    let _ = app
        .notification()
        .builder()
        .title(format!("Atlaswork updated to {now}"))
        .body("Agents keep working on this computer.")
        .show();
}

fn log(app: &AppHandle, line: &str) {
    let Ok(dir) = app.path().app_log_dir() else { return };
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("updates.log");
    let full = std::fs::metadata(&path).is_ok_and(|meta| meta.len() > LOG_BYTES);
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(!full).write(true).truncate(full).open(path) {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|since| since.as_secs()).unwrap_or(0);
        let _ = writeln!(file, "{} {line}", utc(now));
    }
}

/// Seconds since 1970 as UTC ISO 8601, like the helper's log (days to a civil date: Howard Hinnant's algorithm).
fn utc(secs: u64) -> String {
    let (days, rest) = ((secs / 86_400) as i64, secs % 86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z", rest / 3_600, rest % 3_600 / 60, rest % 60)
}

#[cfg(test)]
mod tests {
    use super::utc;

    #[test]
    fn log_times_are_utc_iso() {
        assert_eq!(utc(0), "1970-01-01T00:00:00Z");
        assert_eq!(utc(951_782_400), "2000-02-29T00:00:00Z", "a leap day");
        assert_eq!(utc(1_795_643_530), "2026-11-25T21:52:10Z");
    }
}
