export enum AppState {
  IDLE,
  LOBBY,
  
  // Host is waiting for the guest to send an offer code
  AWAITING_GUEST_OFFER,

  // Guest is prompted to enter a meeting code
  PROMPT_FOR_MEETING_CODE,
  // Guest has sent their offer and is waiting for the host's answer
  AWAITING_HOST_ANSWER,

  CONNECTED,
  ERROR,
}
