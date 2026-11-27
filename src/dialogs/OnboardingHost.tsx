// Onboarding's host: shows the first-run dialog (OnboardingDialog.tsx, loaded only for a new workspace) when it applies.
import { lazy, useState } from "react";
import { useApp, useUi, useView } from "../appContext.ts";
import { onboardingStart, untouched } from "../onboarding.ts";
import type { OnboardingStart } from "../onboarding.ts";

// Shown once, to a new workspace; everyone else never needs its code.
const Onboarding = lazy(() => import("../OnboardingDialog.tsx"));

export function OnboardingHost() {
  const { actions } = useApp();
  const reopen = useUi((state) => state.reopenOnboarding);
  const onboarded = useView((view) => view.session.onboarded);
  const fresh = useView((view) => untouched(view.data));
  const name = useView((view) => view.session.profileName);
  const picture = useView((view) => view.profilePicture);
  const photo = useView((view) => view.session.profilePhoto);
  const hue = useView((view) => view.session.profileHue);
  const portrait = useView((view) => view.session.profilePortrait);
  const data = useView((view) => view.data);
  // Read once per showing: the flow keeps the workspace it opened over, so its fixed picks don't shift mid-run.
  const [start, setStart] = useState<OnboardingStart | null>(null);
  const showing = reopen || (!onboarded && fresh);
  if (showing && !start) setStart(onboardingStart(data));
  if (!showing && start) setStart(null);
  if (!showing || !start) return null;
  return <Onboarding name={name} you={{ picture, photo, hue, portrait }} start={start}
    onProfile={(patch) => void actions.updateSession(patch)} onTheme={actions.setTheme}
    onSkip={actions.closeOnboarding} onFinish={actions.finishOnboarding}
    onModel={(picks, tab) => { actions.finishOnboarding(picks); actions.openSettings(tab); }} />;
}
