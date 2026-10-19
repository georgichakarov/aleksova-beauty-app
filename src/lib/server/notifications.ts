export type BookingNotice = { reference: string; status: "pending" };
export type NotificationResult = {
  mode: "local-preview" | "provider" | "unavailable";
  delivered: boolean;
};

export interface NotificationProvider {
  sendBookingRequest(notice: BookingNotice): Promise<NotificationResult>;
}

export const localPreviewProvider: NotificationProvider = {
  async sendBookingRequest() {
    return { mode: "local-preview", delivered: false };
  },
};

let provider: NotificationProvider = localPreviewProvider;

export function configureNotificationProvider(next: NotificationProvider) {
  provider = next;
}

export async function notifyBookingRequest(notice: BookingNotice): Promise<NotificationResult> {
  try {
    return await provider.sendBookingRequest(notice);
  } catch {
    return { mode: "unavailable", delivered: false };
  }
}
