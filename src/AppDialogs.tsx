// Every popup over the workspace: search, Customize, Settings, Capture, the record dialogs, onboarding, confirmations,
// the toast and the storage alert. Each follows only its own part of the UI store, so opening one or typing in one
// redraws that popup, not the app (docs/adr/0002).
import { Suspense } from "react";
import { useUi } from "./appContext.ts";
import { SearchDialog } from "./dialogs/SearchDialog.tsx";
import { PageEditorHost } from "./dialogs/PageEditorHost.tsx";
import { SettingsHost } from "./dialogs/SettingsHost.tsx";
import { StorageAlert, Toast, ConfirmDialog } from "./dialogs/Notices.tsx";
import { CaptureDialog } from "./dialogs/CaptureDialog.tsx";
import { TopicDialog } from "./dialogs/TopicDialog.tsx";
import { KeepSheet } from "./dialogs/KeepSheet.tsx";
import { TaskDialog } from "./dialogs/TaskDialog.tsx";
import { DomainDialog } from "./dialogs/DomainDialog.tsx";
import { ProjectDialog } from "./dialogs/ProjectDialog.tsx";
import { AgentDialogHost } from "./dialogs/AgentDialogHost.tsx";
import { OnboardingHost } from "./dialogs/OnboardingHost.tsx";
import { RoomDialog } from "./dialogs/RoomDialog.tsx";
import { TeamDialog } from "./dialogs/TeamDialog.tsx";

function ModalHost() {
  const modal = useUi((state) => state.modal);
  if (modal === "search" || modal === "context" || modal === "tabs") return <SearchDialog modal={modal} />;
  if (modal === "widgets") return <PageEditorHost />;
  if (modal === "settings") return <Suspense fallback={null}><SettingsHost /></Suspense>;
  return null;
}

/** Every popup, in the order they stack. */
export default function AppDialogs() {
  return <>
    <StorageAlert />
    <Toast />
    <ModalHost />
    <CaptureDialog />
    <TopicDialog />
    <KeepSheet />
    <TaskDialog />
    <DomainDialog />
    <ProjectDialog />
    <Suspense fallback={null}><AgentDialogHost /></Suspense>
    <Suspense fallback={null}><OnboardingHost /></Suspense>
    <RoomDialog />
    <TeamDialog />
    <ConfirmDialog />
  </>;
}
