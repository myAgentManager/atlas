// A single process-wide event bus. The store and agent emit onto it; the HTTP
// layer subscribes and fans events out to browsers over Server-Sent Events.
import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(100);

// event payloads:
//   'event' -> { taskId, event }   a new activity-feed entry
//   'task'  -> task                 a task was created/updated/deleted
