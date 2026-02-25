/** Alert category – determines icon and color treatment */
export type AlertType = "announcement" | "warning" | "maintenance" | "info" | "beta";

/** User-facing alert – no admin metadata */
export interface ActiveAlert {
  id: number;
  message: string;
  alertType: AlertType;
}

/** Admin-facing alert – includes who created it and full date range */
export interface AdminAlert extends ActiveAlert {
  startsAt: string;
  endsAt: string;
  createdBy: string;
  createdAt: string;
}
