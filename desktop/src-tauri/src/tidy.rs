//! Tidying this computer's files (agents-design D79). The helper, which stays read-only, hands the app a tidy job's
//! order on its stdout; the app checks each move again and makes it here, only for a file inside a folder on this
//! computer's search list, into a folder straight in Documents or under a new name where it is, never over an existing
//! file and never to another drive. What it moved is kept in `tidy.json` (beside its settings), so Undo can put the
//! files back while they're unchanged and their old place is free, and an order that comes again gets the same answer
//! instead of moving anything twice. Nothing is deleted, so there's no bin.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// A tidy job's order: Apply with its moves, or Undo of what this computer moved for that proposal.
#[derive(Deserialize)]
pub struct Order {
    pub job: String,
    pub proposal: String,
    pub undo: bool,
    #[serde(default)]
    pub moves: Vec<Move>,
}

/// One move as the reply proposed it: the file's path as the search found it (its listed folder's name first), and the
/// folder in Documents it goes to, its new name (without the extension, which stays), or both.
#[derive(Deserialize)]
pub struct Move {
    pub file: String,
    pub folder: Option<String>,
    pub name: Option<String>,
}

/// What became of one file: moved (or put back), or why it stayed where it was.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FileResult {
    pub file: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failed: Option<String>,
}

/// What the app tells the helper about a job: what it did with each file, or why it did nothing.
#[derive(Debug, PartialEq, Serialize)]
#[serde(untagged)]
pub enum Outcome {
    Results { job: String, results: Vec<FileResult> },
    Failed { job: String, failed: String },
}

/// Where a tidy may reach on this computer: the search list's folders, by the names paths start with, and Documents.
pub struct Here {
    pub folders: Vec<(String, PathBuf)>,
    pub documents: PathBuf,
}

/// One file the app moved: where it was and is, and its size and change time there, so Undo knows it's unchanged.
#[derive(Clone, Serialize, Deserialize)]
struct Moved {
    file: String,
    from: PathBuf,
    to: PathBuf,
    size: u64,
    modified: u128,
}

/// What the app did for one tidy: what it reported on Apply, what's still moved, and what it reported on Undo.
#[derive(Clone, Serialize, Deserialize)]
struct Tidied {
    proposal: String,
    applied: Vec<FileResult>,
    moved: Vec<Moved>,
    undone: Option<Vec<FileResult>>,
}

/// The tidies this computer made, newest last; the oldest go once there are `KEPT`.
#[derive(Default, Serialize, Deserialize)]
pub struct Log {
    tidies: Vec<Tidied>,
}
const KEPT: usize = 200;

pub fn load(path: &Path) -> Log {
    std::fs::read_to_string(path).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default()
}

pub fn save(path: &Path, log: &Log) -> std::io::Result<()> {
    std::fs::write(path, serde_json::to_vec(log)?)
}

/// Runs one order against `here`, keeping what moved in `log`.
pub fn run(order: Order, here: &Here, log: &mut Log) -> Outcome {
    let known = log.tidies.iter().position(|tidied| tidied.proposal == order.proposal);
    if order.undo {
        let Some(index) = known else {
            return Outcome::Failed { job: order.job, failed: "This computer has no record of moving those files.".into() };
        };
        let tidied = &mut log.tidies[index];
        if tidied.undone.is_none() {
            let back: Vec<(FileResult, bool)> = tidied.moved.iter().map(|moved| match put_back(moved) {
                Ok(()) => (FileResult { file: moved.file.clone(), failed: None }, true),
                Err(why) => (FileResult { file: moved.file.clone(), failed: Some(why) }, false),
            }).collect();
            tidied.moved = tidied.moved.iter().zip(&back).filter(|(_, (_, back))| !back).map(|(moved, _)| moved.clone()).collect();
            tidied.undone = Some(back.into_iter().map(|(result, _)| result).collect());
        }
        return Outcome::Results { job: order.job, results: tidied.undone.clone().unwrap_or_default() };
    }
    if let Some(index) = known {
        return Outcome::Results { job: order.job, results: log.tidies[index].applied.clone() };
    }
    let mut tidied = Tidied { proposal: order.proposal, applied: Vec::new(), moved: Vec::new(), undone: None };
    for each in &order.moves {
        match make(each, here) {
            Ok(moved) => {
                tidied.applied.push(FileResult { file: each.file.clone(), failed: None });
                tidied.moved.push(moved);
            }
            Err(why) => tidied.applied.push(FileResult { file: each.file.clone(), failed: Some(why) }),
        }
    }
    let results = tidied.applied.clone();
    log.tidies.push(tidied);
    let extra = log.tidies.len().saturating_sub(KEPT);
    log.tidies.drain(..extra);
    Outcome::Results { job: order.job, results }
}

const OUTSIDE: &str = "it isn't in a folder agents may search";

/// The file a move names, by its real path: inside a folder on the search list, outside Windows', programs' and apps'
/// own folders.
fn source(file: &str, here: &Here) -> Result<PathBuf, String> {
    let (name, rest) = file.split_once('/').ok_or(OUTSIDE)?;
    let (_, root) = here.folders.iter().find(|(listed, _)| listed == name).ok_or(OUTSIDE)?;
    if rest.split('/').any(|part| part.is_empty() || part == "." || part == "..") {
        return Err(OUTSIDE.into());
    }
    let real = std::fs::canonicalize(root.join(rest.replace('/', "\\"))).map_err(|_| "it isn't there any more")?;
    let root = std::fs::canonicalize(root).map_err(|_| OUTSIDE)?;
    if !real.starts_with(&root) {
        return Err(OUTSIDE.into());
    }
    if super::system_folder(&super::plain(&real).to_string_lossy()) {
        return Err("it's among Windows', programs' or apps' own files".into());
    }
    if !real.is_file() {
        return Err("it isn't a file".into());
    }
    Ok(real)
}

/// A name Windows takes for one file or folder, as the reply's checks made it (supabase/functions/agent/tidy.ts).
fn plain_name(name: &str) -> bool {
    let reserved = ["con", "prn", "aux", "nul"];
    let stem = name.split('.').next().unwrap_or("").to_ascii_lowercase();
    let device = reserved.contains(&stem.as_str())
        || (stem.len() == 4 && (stem.starts_with("com") || stem.starts_with("lpt")) && stem.as_bytes()[3].is_ascii_digit());
    !name.is_empty() && name.chars().count() <= 80 && name.trim() == name && !name.ends_with('.') && !device
        && !name.chars().any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
}

/// Makes one move: its folder in Documents if it isn't there yet, then the file, never over another.
fn make(each: &Move, here: &Here) -> Result<Moved, String> {
    let from = source(&each.file, here)?;
    let file_name = from.file_name().ok_or(OUTSIDE)?.to_string_lossy().into_owned();
    let name = match &each.name {
        Some(name) if plain_name(name) => match from.extension() {
            Some(extension) => format!("{name}.{}", extension.to_string_lossy()),
            None => name.clone(),
        },
        Some(_) => return Err("Windows can't take that name".into()),
        None => file_name,
    };
    let dir = match &each.folder {
        Some(folder) if plain_name(folder) => {
            let documents = std::fs::canonicalize(&here.documents).map_err(|_| "this computer's Documents isn't there")?;
            let dir = documents.join(folder);
            if !dir.is_dir() {
                std::fs::create_dir(&dir).map_err(|_| format!("Windows didn't make the folder {folder}"))?;
            }
            dir
        }
        Some(_) => return Err("Windows can't take that folder name".into()),
        None => from.parent().ok_or(OUTSIDE)?.to_path_buf(),
    };
    let to = dir.join(&name);
    if to == from {
        return Err("it's already there".into());
    }
    move_file(&from, &to)?;
    let meta = std::fs::metadata(&to).map_err(|_| "it moved, but can't be read there")?;
    Ok(Moved { file: each.file.clone(), from, to, size: meta.len(), modified: modified(&meta) })
}

fn modified(meta: &std::fs::Metadata) -> u128 {
    meta.modified().ok().and_then(|time| time.duration_since(UNIX_EPOCH).ok()).map_or(0, |since| since.as_nanos())
}

/// Puts a moved file back where it was, while it's unchanged and nothing has taken its old place.
fn put_back(moved: &Moved) -> Result<(), String> {
    let meta = std::fs::metadata(&moved.to).map_err(|_| "it isn't where it was moved any more")?;
    if meta.len() != moved.size || modified(&meta) != moved.modified {
        return Err("it changed since it moved".into());
    }
    if moved.from.exists() {
        return Err("another file is in its old place now".into());
    }
    if !moved.from.parent().is_some_and(Path::is_dir) {
        return Err("its old folder isn't there any more".into());
    }
    move_file(&moved.to, &moved.from)
}

/// Moves one file on the same drive, never over an existing one (Windows refuses both, unlike `std::fs::rename`).
#[cfg(windows)]
fn move_file(from: &Path, to: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    let wide = |path: &Path| path.as_os_str().encode_wide().chain(Some(0)).collect::<Vec<u16>>();
    let (from, to) = (wide(from), wide(to));
    // Flags 0: no replacing an existing file, no copying to another drive.
    if unsafe { windows_sys::Win32::Storage::FileSystem::MoveFileExW(from.as_ptr(), to.as_ptr(), 0) } != 0 {
        return Ok(());
    }
    Err(match std::io::Error::last_os_error().raw_os_error() {
        Some(80 | 183) => "a file of that name is already there".into(),
        Some(17) => "it's on another drive than Documents".into(),
        Some(32 | 33) => "it's open in another program".into(),
        Some(5) => "Windows didn't allow it".into(),
        Some(2 | 3) => "it isn't there any more".into(),
        Some(code) => format!("Windows refused (error {code})"),
        None => "Windows refused".into(),
    })
}

#[cfg(not(windows))]
fn move_file(from: &Path, to: &Path) -> Result<(), String> {
    if to.exists() {
        return Err("a file of that name is already there".into());
    }
    std::fs::rename(from, to).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{run, FileResult, Here, Log, Move, Order, Outcome};
    use std::path::PathBuf;

    /// A test computer inside this crate's target folder, outside Windows', programs' and apps' own folders: a listed
    /// `Papers` folder, `Documents` and an unlisted `Elsewhere`.
    fn computer(name: &str) -> (PathBuf, Here) {
        let base = std::env::current_dir().unwrap().join("target").join(name);
        let _ = std::fs::remove_dir_all(&base);
        for dir in ["Papers/Banco", "Documents", "Elsewhere"] {
            std::fs::create_dir_all(base.join(dir)).unwrap();
        }
        for (path, text) in [("Papers/Banco/scan_0412.docx", "letter"), ("Papers/recibo.txt", "receipt"), ("Papers/old.txt", "old"),
            ("Documents/Bank/Taken.txt", "keep me"), ("Elsewhere/secret.pdf", "%PDF")] {
            std::fs::create_dir_all(base.join(path).parent().unwrap()).unwrap();
            std::fs::write(base.join(path), text).unwrap();
        }
        let here = Here { folders: vec![("Papers".into(), base.join("Papers"))], documents: base.join("Documents") };
        (base, here)
    }
    fn order(job: &str, undo: bool, moves: &[(&str, Option<&str>, Option<&str>)]) -> Order {
        Order { job: job.into(), proposal: "p1".into(), undo, moves: moves.iter().map(|(file, folder, name)| Move {
            file: (*file).into(), folder: folder.map(Into::into), name: name.map(Into::into) }).collect() }
    }
    fn results(outcome: Outcome) -> Vec<(String, Option<String>)> {
        match outcome {
            Outcome::Results { results, .. } => results.into_iter().map(|FileResult { file, failed }| (file, failed)).collect(),
            Outcome::Failed { failed, .. } => panic!("{failed}"),
        }
    }
    const OK: Option<String> = None;
    fn no(why: &str) -> Option<String> { Some(why.into()) }

    #[test]
    fn moves_only_listed_files_into_documents_never_over_another_and_answers_again_the_same() {
        let (base, here) = computer("tidy-apply-test");
        let mut log = Log::default();
        let apply = order("j1", false, &[
            ("Papers/Banco/scan_0412.docx", Some("Bank"), Some("Carta 2026")),
            ("Papers/recibo.txt", None, Some("Recibo farmacia")),
            ("Papers/old.txt", Some("Bank"), Some("Taken")),
            ("Elsewhere/secret.pdf", Some("Bank"), None),
            ("Papers/../Elsewhere/secret.pdf", Some("Bank"), None),
            ("Papers/missing.pdf", Some("Bank"), None),
            ("Papers/old.txt", Some("..\\Windows"), None),
            ("Papers/old.txt", None, Some("CON")),
        ]);
        assert_eq!(results(run(apply, &here, &mut log)), vec![
            ("Papers/Banco/scan_0412.docx".into(), OK),
            ("Papers/recibo.txt".into(), OK),
            ("Papers/old.txt".into(), no("a file of that name is already there")),
            ("Elsewhere/secret.pdf".into(), no("it isn't in a folder agents may search")),
            ("Papers/../Elsewhere/secret.pdf".into(), no("it isn't in a folder agents may search")),
            ("Papers/missing.pdf".into(), no("it isn't there any more")),
            ("Papers/old.txt".into(), no("Windows can't take that folder name")),
            ("Papers/old.txt".into(), no("Windows can't take that name")),
        ]);
        assert_eq!(std::fs::read_to_string(base.join("Documents/Bank/Carta 2026.docx")).unwrap(), "letter", "into a folder in Documents, keeping its type");
        assert_eq!(std::fs::read_to_string(base.join("Papers/Recibo farmacia.txt")).unwrap(), "receipt", "renamed where it is");
        assert_eq!(std::fs::read_to_string(base.join("Documents/Bank/Taken.txt")).unwrap(), "keep me", "and never over another file");
        assert!(base.join("Papers/old.txt").exists() && base.join("Elsewhere/secret.pdf").exists());
        // The same order again (a report that never arrived) moves nothing and says the same.
        std::fs::write(base.join("Papers/Banco/scan_0412.docx"), "a new one").unwrap();
        let again = results(run(order("j2", false, &[("Papers/Banco/scan_0412.docx", Some("Bank"), Some("Carta 2026"))]), &here, &mut log));
        assert_eq!(again.len(), 8, "the first answer, whole");
        assert_eq!(std::fs::read_to_string(base.join("Papers/Banco/scan_0412.docx")).unwrap(), "a new one");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn undo_puts_back_unchanged_files_whose_old_place_is_free_and_answers_again_the_same() {
        let (base, here) = computer("tidy-undo-test");
        let mut log = Log::default();
        assert!(matches!(run(order("j0", true, &[]), &here, &mut log), Outcome::Failed { .. }), "nothing moved yet");
        let moved = results(run(order("j1", false, &[
            ("Papers/Banco/scan_0412.docx", Some("Bank"), Some("Carta 2026")),
            ("Papers/recibo.txt", None, Some("Recibo farmacia")),
            ("Papers/old.txt", Some("Bank"), Some("Old")),
        ]), &here, &mut log));
        assert!(moved.iter().all(|(_, failed)| failed.is_none()));
        std::fs::write(base.join("Papers/recibo.txt"), "another receipt").unwrap();
        std::fs::write(base.join("Documents/Bank/Old.txt"), "changed since").unwrap();
        let back = vec![
            ("Papers/Banco/scan_0412.docx".to_string(), OK),
            ("Papers/recibo.txt".to_string(), no("another file is in its old place now")),
            ("Papers/old.txt".to_string(), no("it changed since it moved")),
        ];
        assert_eq!(results(run(order("j2", true, &[]), &here, &mut log)), back);
        assert_eq!(std::fs::read_to_string(base.join("Papers/Banco/scan_0412.docx")).unwrap(), "letter", "back where it was");
        assert_eq!(std::fs::read_to_string(base.join("Papers/recibo.txt")).unwrap(), "another receipt", "never over the newcomer");
        assert!(base.join("Papers/Recibo farmacia.txt").exists() && base.join("Documents/Bank/Old.txt").exists(), "the others stay");
        assert_eq!(results(run(order("j3", true, &[]), &here, &mut log)), back, "an Undo that comes again says the same");
        let path = base.join("tidy.json");
        super::save(&path, &log).unwrap();
        assert_eq!(results(run(order("j4", true, &[]), &here, &mut super::load(&path))), back, "after a restart too");
        let _ = std::fs::remove_dir_all(&base);
    }
}
