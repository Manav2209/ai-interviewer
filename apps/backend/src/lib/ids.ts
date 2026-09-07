import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghjkmnpqrstuvwxyz";
const random = customAlphabet(alphabet, 16);

export function newId(prefix: string): string {
  return `${prefix}_${random()}`;
}

export function newInterviewId(): string {
  return newId("int");
}

export function newContextId(): string {
  return newId("ctx");
}

export function newPlanId(): string {
  return newId("plan");
}

export function newSessionId(): string {
  return newId("sess");
}

export function newEventId(): string {
  return newId("evt");
}

export function newTurnId(): string {
  return newId("turn");
}