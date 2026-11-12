import type { ComponentType } from "react";
import type { PublicSiteInformation } from "@/shared/reader/site-navigation/site-navigation";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  SpotifyIcon,
} from "../site-icons/site-icons";
import styles from "./social-links.module.css";

type Social = {
  key: "instagram" | "spotify" | "linkedin" | "facebook";
  label: string;
  href: string;
  Icon: ComponentType;
};
// Only links an administrator configured; nothing is invented.
export function socialLinks(information?: PublicSiteInformation): Social[] {
  if (!information) return [];
  const all: (Omit<Social, "href"> & { href: string | null })[] = [
    {
      key: "instagram",
      label: "Instagram",
      href: information.instagramUrl,
      Icon: InstagramIcon,
    },
    {
      key: "spotify",
      label: "Spotify",
      href: information.spotifyUrl,
      Icon: SpotifyIcon,
    },
    {
      key: "linkedin",
      label: "LinkedIn",
      href: information.linkedinUrl,
      Icon: LinkedInIcon,
    },
    {
      key: "facebook",
      label: "Facebook",
      href: information.facebookUrl,
      Icon: FacebookIcon,
    },
  ];
  return all.filter((social): social is Social => Boolean(social.href));
}

export function StayConnected({
  information,
}: {
  information?: PublicSiteInformation;
}) {
  const links = socialLinks(information);
  if (!links.length) return null;
  return (
    <section className={styles.connect} aria-labelledby="stay-connected-title">
      <h2 id="stay-connected-title">Stay Connected</h2>
      <ul>
        {links.map(({ key, label, href, Icon }) => (
          <li key={key}>
            <a className={`${styles.pill} ${styles[key]}`} href={href}>
              <Icon />
              {label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
