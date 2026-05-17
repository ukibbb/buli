const disabledTuiAnimationTimerEnvValue = "1";

export function areTuiAnimationTimersEnabled(): boolean {
  return process.env["BULI_DISABLE_TUI_ANIMATION_TIMERS"] !== disabledTuiAnimationTimerEnvValue;
}
