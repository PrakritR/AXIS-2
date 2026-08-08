"use client";

import { OAuthSocialStack } from "@/components/auth/oauth-social-stack";
import {
  persistProspectHandoff,
  type ProspectHandoffSnapshot,
} from "@/lib/auth/prospect-handoff-storage";

export function ProspectOAuthSignUpButtons({
  handoff,
  disabled = false,
  onError,
}: {
  handoff: ProspectHandoffSnapshot;
  disabled?: boolean;
  onError?: (message: string) => void;
}) {
  const nextPath =
    handoff.nextPath?.trim().startsWith("/") ? handoff.nextPath.trim() : "/resident/tour/pending";

  return (
    <OAuthSocialStack
      intent="resident"
      viaContinue={false}
      fixedCallbackPath="/auth/callback/resident-signup"
      nextPath={nextPath}
      disabled={disabled}
      onError={onError}
      onBeforeRedirect={() => persistProspectHandoff(handoff)}
    />
  );
}
