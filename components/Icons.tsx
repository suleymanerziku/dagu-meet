// icons.tsx or icons/index.tsx

import React from 'react';
import Icon from '@mdi/react';
import {
  mdiMicrophone,
  mdiMicrophoneOff,
  mdiVideo,
  mdiVideoOff,
  mdiPhoneHangup,
  mdiContentCopy,
  mdiVideoPlusOutline,
  mdiKeyboard,
} from '@mdi/js';

type IconProps = {
  className?: string;
  size?: number | string;
  color?: string;
  title?: string;
};

export const MicIcon = (props: IconProps) => (
  <Icon path={mdiMicrophone} size={props.size ?? 1} {...props} />
);

export const MicOffIcon = (props: IconProps) => (
  <Icon path={mdiMicrophoneOff} size={props.size ?? 1} {...props} />
);

export const VideoIcon = (props: IconProps) => (
  <Icon path={mdiVideo} size={props.size ?? 1} {...props} />
);

export const VideoOffIcon = (props: IconProps) => (
  <Icon path={mdiVideoOff} size={props.size ?? 1} {...props} />
);

export const HangUpIcon = (props: IconProps) => (
  <Icon path={mdiPhoneHangup} size={props.size ?? 1} {...props} />
);

export const CopyIcon = (props: IconProps) => (
  <Icon path={mdiContentCopy} size={props.size ?? 1} {...props} />
);

export const NewMeetingIcon = (props: IconProps) => (
  <Icon path={mdiVideoPlusOutline} size={props.size ?? 1} {...props} />
);

export const KeyboardIcon = (props: IconProps) => (
  <Icon path={mdiKeyboard} size={props.size ?? 1} {...props} />
);
