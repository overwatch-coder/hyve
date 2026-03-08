import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import ExperimentMode from "@/components/ExperimentMode";
import { Loader2 } from "lucide-react";

import { ReactFlowProvider } from "@xyflow/react";

const ExperimentPage: React.FC = () => {
  const { productId } = useParams();
  const navigate = useNavigate();

  const { data: product, isLoading: productLoading } = useQuery({
    queryKey: ["product-deep", productId],
    queryFn: async () => {
      const res = await api.get(`/products/${productId}`);
      return res.data;
    },
    enabled: !!productId,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["product-analytics", productId],
    queryFn: async () => {
      const res = await api.get(`/products/${productId}/analytics`);
      return res.data;
    },
    enabled: !!productId,
  });

  if (productLoading || analyticsLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-4 bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">
          Initializing Mission Environment...
        </p>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <ExperimentMode
        open={true}
        onOpenChange={(open) => {
          if (!open) navigate(`/products/${productId}`);
        }}
        product={product}
        analytics={analytics}
      />
    </ReactFlowProvider>
  );
};

export default ExperimentPage;
