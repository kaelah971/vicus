"use client";

import { useEffect, useState } from "react";
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
  | { status: "signed-in"; handle: string; publicKey: string }
  | { status: "error"; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
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

export function WalletAuthButton() {
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => ({ response, body: await readJson(response) }))
      .then(({ response, body }) => {
        if (!active) return;
        if (response.ok && isObject(body) && body.authenticated === true && isObject(body.user) && isObject(body.wallet)) {
          setSession({
            status: "signed-in",
            handle: typeof body.user.handle === "string" ? body.user.handle : "member",
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
      setSession({ status: "signed-out" });
    } catch {
      setMessage("The session could not be closed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (session.status === "signed-in") {
    return (
      <div className="wallet-auth-control">
        <a className="wallet-session-link" href="/profile/me" title={shortenAddress(session.publicKey)}>
          @{session.handle}
        </a>
        <button className="button button-outline button-small" disabled={busy} onClick={disconnect} type="button">
          {busy ? "Closing…" : "Disconnect"}
        </button>
        {message ? <span className="wallet-auth-message" role="status">{message}</span> : null}
      </div>
    );
  }

  return (
    <div className="wallet-auth-control">
      <button className="button button-outline button-small" disabled={busy} onClick={connect} type="button">
        {busy ? "Connecting…" : "Connect Freighter"}
      </button>
      {session.status === "error" ? <span className="wallet-auth-message" role="alert">{session.message}</span> : null}
      {message ? <span className="wallet-auth-message" role="alert">{message}</span> : null}
    </div>
  );
}

export function WalletConnectPrompt() {
  return (
    <div className="wallet-connect-prompt">
      <p>Connect Freighter to participate with a verified Stellar mainnet account.</p>
      <p className="field-help">Sign a message to verify this Stellar wallet. No transaction will be submitted and no XLM is required.</p>
      <WalletAuthButton />
    </div>
  );
}

export { shortenAddress };
