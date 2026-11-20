export class SpendableError extends Error {
 readonly code:string; readonly status:number; readonly details:Readonly<Record<string,unknown>>;
 constructor(code:string,message:string,status=422,details:Readonly<Record<string,unknown>>={}) {
  super(message);this.name='SpendableError';this.code=code;this.status=status;this.details=details;
 }
}
export function assertCondition(value:unknown,code:string,message:string,status=422):asserts value {
 if(!value)throw new SpendableError(code,message,status);
}
