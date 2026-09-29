"use client";

import { EditBuildingDialog } from "@/components/dashboard/edit-dialogs";
import { RowAction } from "@/components/dashboard/row-action";
import type { ApiBuilding } from "@/lib/dashboard-types";

/**
 * Edit + delete for the building cards on `/buildings` (owner only, matching the
 * API guards: `PATCH /buildings/:id` is owner/manager, `DELETE` is owner).
 */
export function BuildingActions({ building }: { building: ApiBuilding }) {
  return (
    <div className="flex items-center gap-1">
      <EditBuildingDialog building={building} />
      <RowAction
        endpoint={`/api/buildings/${building.id}`}
        method="DELETE"
        label="Supprimer l’immeuble"
        icon="trash"
        confirm
        confirmTitle={`Supprimer ${building.name} ? Ses unités doivent être supprimées d’abord.`}
        successMessage="Immeuble supprimé."
      />
    </div>
  );
}
