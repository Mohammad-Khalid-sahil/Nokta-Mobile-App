import { Message } from '../../models/Message';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const messageTypePath = Message.schema.path('messageType') as { enumValues?: string[] };
assert(
  Boolean(messageTypePath.enumValues?.includes('public_contact')),
  'Message.messageType enum must include public_contact for public contact form'
);

console.log('public-contact schema tests passed');
