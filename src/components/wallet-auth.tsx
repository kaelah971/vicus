"use client";

import { useEffect, useRef, useState } from "react";
import * as FreighterApi from "@stellar/freighter-api";
import { Networks as WalletNetworks, StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";

let kitReady = false;

function ensureWalletKit() {
  if (!kitReady) {
    StellarWalletsKit.init({
      modules: defaultModules({ filterBy: (module) => module.productId === "freighter" }),
      network: WalletNetworks.PUBLIC,
      authModal: {
        showInstallLabel: true,
        hideUnsupportedWallets: false,
      },
    });
    kitReady = true;
  }

  StellarWalletsKit.setNetwork(WalletNetworks.PUBLIC);
  return StellarWalletsKit;
}

type SessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; publicKey: string }
  | { status: "error"; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function shortenAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

async function readJson(response: Response) {
  return (await response.json().catch(() => null)) as unknown;
}

function signatureToBase64(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (!(value instanceof Uint8Array)) {
    return null;
  }

  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  if (isObject(error) && typeof error.message === "string") {
    return error.message;
  }

  return fallback;
}

export function WalletAuthButton({ showMobileNavigation = true }: { showMobileNavigation?: boolean } = {}) {
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => ({ response, body: await readJson(response) }))
      .then(({ response, body }) => {
        if (!active) return;
        if (response.ok && isObject(body) && body.authenticated === true && isObject(body.user) && isObject(body.wallet)) {
          setSession({
            status: "signed-in",
            publicKey: typeof body.wallet.publicKey === "string" ? body.wallet.publicKey : "",
          });
        } else {
          setSession({ status: "signed-out" });
        }
      })
      .catch(() => {
        if (active) setSession({ status: "signed-out" });
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!accountOpen && !mobileMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !controlRef.current?.contains(target)) {
        setAccountOpen(false);
        setMobileMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      if (accountOpen) {
        setAccountOpen(false);
        accountTriggerRef.current?.focus();
      }
      if (mobileMenuOpen) {
        setMobileMenuOpen(false);
        mobileTriggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountOpen, mobileMenuOpen]);

  async function connect() {
    setBusy(true);
    setMessage("");

    try {
      const kit = ensureWalletKit();
      const { address } = await kit.authModal();
      const network = await kit.getNetwork();
      if (network.networkPassphrase !== WalletNetworks.PUBLIC) {
        throw new Error("Switch Freighter to the Stellar mainnet before connecting.");
      }

      const challengeResponse = await fetch("/api/auth/stellar/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const challengeBody = await readJson(challengeResponse);
      if (!challengeResponse.ok || !isObject(challengeBody) || typeof challengeBody.message !== "string") {
        throw new Error(
          isObject(challengeBody) && typeof challengeBody.message === "string"
            ? challengeBody.message
            : "A wallet message could not be created.",
        );
      }

      setMessage("Sign a message to verify this Stellar wallet. No transaction will be submitted and no XLM is required.");
      const signed = await FreighterApi.signMessage(challengeBody.message, {
        address,
        networkPassphrase: WalletNetworks.PUBLIC,
      });
      if (signed.error) {
        throw new Error(signed.error.message);
      }
      if (signed.signerAddress.toUpperCase() !== address.toUpperCase()) {
        throw new Error("The Freighter wallet changed during sign-in. Connect the selected wallet and try again.");
      }

      const signature = signatureToBase64(signed.signedMessage);
      if (!signature) {
        throw new Error("Freighter did not return a signed message.");
      }

      const verifyResponse = await fetch("/api/auth/stellar/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: challengeBody.message, signature }),
      });
      const verifyBody = await readJson(verifyResponse);
      if (!verifyResponse.ok || !isObject(verifyBody) || verifyBody.ok !== true) {
        throw new Error(
          isObject(verifyBody) && typeof verifyBody.message === "string"
            ? verifyBody.message
            : "The signed wallet message could not be verified.",
        );
      }

      window.location.reload();
    } catch (error) {
      setMessage(errorMessage(error, "Wallet connection was cancelled or the message was rejected."));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setMessage("");
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      await ensureWalletKit().disconnect().catch(() => undefined);
      setAccountOpen(false);
      setMobileMenuOpen(false);
      setSession({ status: "signed-out" });
    } catch {
      setMessage("The session could not be closed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const isSignedIn = session.status === "signed-in";
  const mobileNavigation = (
    <nav aria-label="Mobile navigation" className="wallet-mobile-nav">
      <a className="wallet-menu-link" href="/explore" onClick={() => setMobileMenuOpen(false)}>
        Explore
      </a>
      <a className="wallet-menu-link" href="/explore#circle-directory" onClick={() => setMobileMenuOpen(false)}>
        Circles
      </a>
      <a className="wallet-menu-link" href="/explore#missions" onClick={() => setMobileMenuOpen(false)}>
        Missions
      </a>
      <a className="wallet-menu-link" href="/admin" onClick={() => setMobileMenuOpen(false)}>
        Issuer access
      </a>
    </nav>
  );

  return (
    <div
      className="wallet-auth-control"
      data-authenticated={isSignedIn ? "true" : "false"}
      data-mobile-navigation={showMobileNavigation ? "true" : "false"}
      ref={controlRef}
    >
      <div className="wallet-desktop-control">
        {isSignedIn ? (
          <>
            <button
              aria-controls="wallet-account-menu"
              aria-expanded={accountOpen}
              className="wallet-profile-trigger"
              id="wallet-profile-trigger"
              onClick={() => {
                setAccountOpen((open) => !open);
                setMobileMenuOpen(false);
              }}
              ref={accountTriggerRef}
              type="button"
            >
              <span aria-hidden="true" className="verified-indicator" />
              <span>Profile</span>
            </button>
            {accountOpen ? (
              <div aria-labelledby="wallet-profile-trigger" className="wallet-account-menu" id="wallet-account-menu">
                <div className="wallet-account-summary">
                  <strong>Vicus member</strong>
                  <span className="wallet-account-address">{shortenAddress(session.publicKey)}</span>
                  <span className="wallet-account-status">
                    <span aria-hidden="true" className="verified-indicator" />
                    Stellar wallet verified
                  </span>
                </div>
                <div className="wallet-menu-actions">
                  <a className="wallet-menu-link" href="/profile/me" onClick={() => setAccountOpen(false)}>
                    View profile
                  </a>
                  <button className="wallet-menu-action" disabled={busy} onClick={disconnect} type="button">
                    {busy ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <button className="button button-outline button-small" disabled={busy} onClick={connect} type="button">
            {busy ? "Connecting…" : "Connect Freighter"}
          </button>
        )}
      </div>

      {showMobileNavigation ? (
        <>
          <button
            aria-controls="wallet-mobile-menu"
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? "Close mobile navigation" : "Open mobile navigation"}
            className="wallet-mobile-trigger"
            id="wallet-mobile-trigger"
            onClick={() => {
              setMobileMenuOpen((open) => !open);
              setAccountOpen(false);
            }}
            ref={mobileTriggerRef}
            type="button"
          >
            Menu
          </button>
          {mobileMenuOpen ? (
            <div aria-labelledby="wallet-mobile-trigger" className="wallet-mobile-menu" id="wallet-mobile-menu">
              {mobileNavigation}
              {isSignedIn ? (
                <>
                  <div className="wallet-mobile-member">
                    <strong>Vicus member</strong>
                    <span className="wallet-account-address">{shortenAddress(session.publicKey)}</span>
                    <span className="wallet-account-status">
                      <span aria-hidden="true" className="verified-indicator" />
                      Stellar wallet verified
                    </span>
                  </div>
                  <div className="wallet-menu-actions">
                    <a className="wallet-menu-link" href="/profile/me" onClick={() => setMobileMenuOpen(false)}>
                      Profile
                    </a>
                    <button className="wallet-menu-action" disabled={busy} onClick={disconnect} type="button">
                      {busy ? "Signing out…" : "Sign out"}
                    </button>
                  </div>
                </>
              ) : (
                <button className="wallet-menu-action wallet-menu-connect" disabled={busy} onClick={connect} type="button">
                  {busy ? "Connecting…" : "Connect Freighter"}
                </button>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      {session.status === "error" ? <span className="wallet-auth-message" role="alert">{session.message}</span> : null}
      {message ? <span className="wallet-auth-message" role={isSignedIn ? "status" : "alert"}>{message}</span> : null}
    </div>
  );
}

export function WalletConnectPrompt() {
  return (
    <div className="wallet-connect-prompt">
      <p>Connect Freighter to participate with a verified Stellar mainnet account.</p>
      <p className="field-help">Sign a message to verify this Stellar wallet. No transaction will be submitted and no XLM is required.</p>
      <WalletAuthButton showMobileNavigation={false} />
    </div>
  );
}

export { shortenAddress };
