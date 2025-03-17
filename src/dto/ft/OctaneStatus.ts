export enum OctaneStatus {
  NEW,
  MODIFIED,
  DELETED,
  NONE
}

export namespace OctaneStatus {
  const valueMap: { [key: number]: OctaneStatus } = {
    [OctaneStatus.NEW]: OctaneStatus.NEW,
    [OctaneStatus.MODIFIED]: OctaneStatus.MODIFIED,
    [OctaneStatus.DELETED]: OctaneStatus.DELETED,
    [OctaneStatus.NONE]: OctaneStatus.NONE
  };

  export function get(num: number): OctaneStatus | null {
    return valueMap[num] ?? null;
  }
}