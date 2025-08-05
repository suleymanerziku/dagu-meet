
export enum AppState {
  IDLE,
  
  // Host is waiting for the guest to send an offer code
  AWAITING_GUEST_OFFER,

  // Guest has sent their offer and is waiting for the host's answer
  AWAITING_HOST_ANSWER,

  CONNECTED,
  ERROR,
}
