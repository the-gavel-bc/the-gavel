import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { getOwnProfile } from "@/backend/profiles/own-profile/own-profile";
import { OwnProfileForm } from "@/components/dashboard/profile/own-profile-form";

export default async function OwnProfilePage() {
  let profile;
  try {
    profile = await getOwnProfile();
  } catch (error) {
    unstable_rethrow(error);
    return (
      <>
        <h1>My public profile</h1>
        <p role="alert">Unable to load your profile.</p>
        <Link href="/dashboard/profile" prefetch={false}>
          Try again
        </Link>
      </>
    );
  }
  return (
    <>
      <h1>My public profile</h1>
      <OwnProfileForm profile={profile} />
    </>
  );
}
