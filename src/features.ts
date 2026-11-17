/*
  Switches for features we're still trying out.
  Set one to false to hide the feature from everyone, no other changes needed.
*/

/** Player Pet on the athlete's Today screen. Athletes can also turn it on or off for themselves. */
export const PET_FEATURE = true;

/** The trainer's AI Assistant tab. Needs the trainer-assistant function deployed (README > AI assistant). */
export const ASSISTANT_FEATURE = true;

/**
 * "Join the demo team" on the athlete's join screen, so classmates can try
 * the app without a code. Needs supabase/demo_join.sql. Turn off after demos.
 */
export const DEMO_TEAM_FEATURE = true;
