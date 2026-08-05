/**
 * Landing entry.
 *
 * Rollback options:
 * 1) Set NEXT_PUBLIC_LANDING_V2=0 and restart
 * 2) Change the default import below to LegacyHomePage
 * 3) git revert / drop design/channel-landing branch
 */
import HomePage from "@/components/marketing/HomePage";
import LegacyHomePage from "@/components/marketing/LegacyHomePage";

const useLandingV2 = process.env.NEXT_PUBLIC_LANDING_V2 !== "0";

export default useLandingV2 ? HomePage : LegacyHomePage;
