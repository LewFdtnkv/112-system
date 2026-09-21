export interface PhoneEdit {
  value: string;
  caret: number;
}

export type PhoneIssueCode =
  | "incomplete"
  | "too-long"
  | "invalid-length"
  | "unknown-country"
  | "not-a-number";

export interface PhoneIssue {
  code: PhoneIssueCode;
  message: string;
}
