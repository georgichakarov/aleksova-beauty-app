import { useEffect, useState } from "react";

export type PublicService = {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: number;
  buffer: number | null;
  active: boolean;
};

export function usePublicServices() {
  const [services, setServices] = useState<PublicService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/services")
      .then(async (response) => {
        if (!response.ok) throw new Error("Services are temporarily unavailable.");
        const data = (await response.json()) as { services: PublicService[] };
        if (active) setServices(data.services);
      })
      .catch(() => {
        if (active) setError("Services are temporarily unavailable. Please contact the studio.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { services, loading, error };
}

export const eur = (amount: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
