/** Názvy IPC kanálů mezi hlavním procesem a okny. */
export const IpcChannel = {
  PlayerOpenFile: 'player:open-file',
  PlayerCommand: 'player:command',
  PlayerState: 'player:state',
  PlayerClosed: 'player:closed'
} as const
