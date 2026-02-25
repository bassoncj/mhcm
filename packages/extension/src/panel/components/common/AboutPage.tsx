import { version } from "../../../../package.json";
import { DoodleBackground } from "../onboarding/DoodleBackground.js";
import { onboardingComplete } from "../../signals/onboarding.js";
import discordIcon from "../../assets/discord.svg";
import githubIcon from "../../assets/github.svg";

const S = 16;

// Shield with check — generic (no brand logo for privacy policy)
function IconPrivacy() {
  return (
    <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

export function AboutPage() {
  function handleReplayOnboarding() {
    onboardingComplete.value = false;
  }

  return (
    <div class="about-page">
      <div class="about-body">
        <DoodleBackground />

        <div class="about-content">
          <div class="about-header">
            <h1>Community Marketplace</h1>
            <span class="about-version">v{version}</span>
            <p class="about-tagline">Built by the MouseHunt community, for the MouseHunt community 💛</p>
          </div>

          <div class="about-section">
            <div class="about-links">
              <a
                class="about-link"
                href="https://discordapp.com/channels/275500976662773761/1029053362483773480"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img src={discordIcon} alt="" width={S} height={S} class="about-brand-icon" /> Discord
              </a>
              <a
                class="about-link"
                href="https://ko-fi.com/U7U31TLBFT"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src="https://storage.ko-fi.com/cdn/cup-border.png"
                  alt=""
                  width={S}
                  height={S}
                  class="about-kofi-icon"
                />
                Support on Ko-fi
              </a>
              <a
                class="about-link"
                href="https://privacy.embermount.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <IconPrivacy /> Privacy Policy
              </a>
              <a
                class="about-link"
                href="https://github.com/bassoncj/mhcm"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img src={githubIcon} alt="" width={S} height={S} class="about-brand-icon" /> GitHub
              </a>
            </div>
          </div>

          <div class="about-section">
            <h2>Bugs & Feature Requests</h2>
            <p>
              Found a bug or have an idea? Let us know in the{" "}
              <a
                href="https://discordapp.com/channels/275500976662773761/1029053362483773480"
                target="_blank"
                rel="noopener noreferrer"
              >
                Discord channel
              </a>
              .
            </p>
          </div>

          <div class="about-section">
            <button class="about-onboarding-btn" onClick={handleReplayOnboarding}>
              Replay Onboarding
            </button>
          </div>

          <div class="about-disclaimer">
            Not affiliated with MouseHunt or HitGrab Inc.
          </div>

        </div>
      </div>
    </div>
  );
}
