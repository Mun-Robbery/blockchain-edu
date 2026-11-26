import { useEffect, useRef, useState } from "react";
import { BrowserProvider, formatEther, type Signer } from "ethers";
import { CHAIN_ID, demoAllowed, demoSigner, errorMessage, injected, rpc, walletInfo } from "./chain";
import { sameAddress } from "./types";

type Mode = "demo" | "metamask";
type Wallet = {
  mode: Mode;
  address?: string;
  chainId: number;
  balance?: string;
};

export function useWallet(revision: number) {
  const [wallet, setWallet] = useState<Wallet>();
  const [role, setRole] = useState(0);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const ticket = useRef(0);
  const mode = wallet?.mode;
  const address = wallet?.address;
  const chainId = wallet?.chainId;

  useEffect(() => {
    const ethereum = injected();
    if (!ethereum || mode !== "metamask") return;
    let active = true;
    let event = 0;
    const syncWallet = async () => {
      const current = ++event;
      try {
        const info = await walletInfo(ethereum);
        if (active && current === event) {
          setWallet({ mode, ...info });
          setError("");
        }
      } catch (error) {
        if (active && current === event) setError(errorMessage(error, "Не удалось прочитать данные MetaMask."));
      }
    };
    const disconnect = () => {
      event++;
      setWallet(undefined);
      setError("MetaMask отключён.");
    };
    ethereum.on?.("accountsChanged", syncWallet);
    ethereum.on?.("chainChanged", syncWallet);
    ethereum.on?.("disconnect", disconnect);
    return () => {
      active = false;
      ethereum.removeListener?.("accountsChanged", syncWallet);
      ethereum.removeListener?.("chainChanged", syncWallet);
      ethereum.removeListener?.("disconnect", disconnect);
    };
  }, [mode]);

  useEffect(() => {
    if (!mode || !address || chainId !== CHAIN_ID) return;
    let active = true;
    const ethereum = injected();
    const provider = mode === "metamask" && ethereum ? new BrowserProvider(ethereum) : rpc;
    provider.getBalance(address).then((value) => {
      if (active) setWallet((previous) => previous?.address === address
        ? { ...previous, balance: formatEther(value) } : previous);
    }).catch(() => {
      if (active) setWallet((previous) => previous?.address === address
        ? { ...previous, balance: undefined } : previous);
    });
    return () => { active = false; };
  }, [mode, address, chainId, revision]);

  async function connect(next: Mode, demoRole = role) {
    const current = ++ticket.current;
    setConnecting(true);
    setError("");
    setWallet(undefined);
    try {
      if (next === "demo") {
        const signer = await demoSigner(demoRole);
        if (current === ticket.current) {
          setRole(demoRole);
          setWallet({ mode: next, address: signer.address, chainId: CHAIN_ID });
        }
      } else {
        const ethereum = injected();
        if (!ethereum) throw new Error("Расширение MetaMask не найдено. Можно подключить локальное демо.");
        await ethereum.request({ method: "eth_requestAccounts" });
        const info = await walletInfo(ethereum);
        if (current === ticket.current) setWallet({ mode: next, ...info });
      }
    } catch (error) {
      if (current === ticket.current) setError(errorMessage(error, "Не удалось подключить кошелёк."));
    } finally {
      if (current === ticket.current) setConnecting(false);
    }
  }

  async function signer(): Promise<Signer> {
    if (!wallet?.address || wallet.chainId !== CHAIN_ID) throw new Error("Подключите кошелёк в сети Hardhat.");
    let result: Signer;
    if (wallet.mode === "demo") {
      result = await demoSigner(role);
    } else {
      const ethereum = injected();
      if (!ethereum) throw new Error("MetaMask отключён.");
      const current = await walletInfo(ethereum);
      if (current.chainId !== CHAIN_ID) throw new Error("Выберите сеть Hardhat с chain ID 31337.");
      if (!current.address || !sameAddress(wallet.address, current.address)) {
        throw new Error("Адрес кошелька изменился. Повторите действие.");
      }
      result = await new BrowserProvider(ethereum).getSigner(wallet.address);
    }
    if (!sameAddress(await result.getAddress(), wallet.address)) throw new Error("Адрес кошелька изменился.");
    return result;
  }

  function disconnect() {
    ticket.current++;
    setConnecting(false);
    setWallet(undefined);
    setError("");
  }

  return { wallet, role, error, connecting, demoAllowed, connect, disconnect, signer };
}

export type WalletState = ReturnType<typeof useWallet>;
