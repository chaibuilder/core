"use client";

import { getSupabaseClient } from "../../supabase-client";

import { registerFonts } from "@/fonts";
import { defaultChaiLibrary } from "@chaibuilder/sdk";
import { registerChaiLibrary } from "@chaibuilder/sdk/runtime/client";
import "@chaibuilder/sdk/styles";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { LoginScreen } from "./login";
import { updatePages } from "@/package/actions";
const ChaiWebsiteBuilder = dynamic(() => import("@chaibuilder/sdk/pages").then((mod) => mod.ChaiWebsiteBuilder), {
  ssr: false,
});

type LoggedInUser = {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  metadata?: Record<string, unknown>;
};

registerChaiLibrary("chai-library", defaultChaiLibrary());
registerFonts();

export default function Editor() {
  const supabase = getSupabaseClient();
  const [isLoggedIn, setIsLoggedIn] = useState<null | boolean>(null);
  const [user, setUser] = useState<LoggedInUser | null>(null);

  useEffect(() => {
    // Check initial session
    const checkInitialSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata.name,
          role: session.user.user_metadata.role,
        } as LoggedInUser);
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
      }
    };

    checkInitialSession();

    // Listen to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (user?.id && session?.user) {
        //already logged in
        return;
      }
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata.name,
          role: session.user.user_metadata.role,
        } as LoggedInUser);
        setIsLoggedIn(true);
      } else {
        setUser(null);
        setIsLoggedIn(false);
      }
    });

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, [user?.id]);

  const handleLogout = useCallback(
    async (reason?: string) => {
      await supabase.auth.signOut();
      if (reason) {
        window.location.href = `/editor?${reason.toLowerCase()}=true`;
      } else {
        window.location.reload();
      }
    },
    [supabase],
  );

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token as string;
  }, [supabase]);

  const getPreviewUrl = useCallback((slug: string) => `/api/preview?slug=${slug}`, []);
  const getLiveUrl = useCallback((slug: string) => `/api/preview?disable=true&slug=${slug}`, []);

  if (isLoggedIn === null) {
    return null;
  }

  if (!isLoggedIn) {
    return <LoginScreen />;
  }

  return (
    <ChaiWebsiteBuilder
      flags={{
        dragAndDrop: true,
        designTokens: true,
        ai: true,
      }}
      onPublish={updatePages}
      currentUser={user}
      autoSave
      autoSaveActionsCount={5}
      getAccessToken={getAccessToken}
      apiUrl="api"
      getPreviewUrl={getPreviewUrl}
      getLiveUrl={getLiveUrl}
      websocket={supabase}
      onLogout={handleLogout}
    />
  );
}
