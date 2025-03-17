export enum OctaneStatus {
  NEW,
  MODIFIED,
  DELETED,
  NONE
}

export namespace OctaneStatus {
  const valueMap: { [key: number]: string } = {
    [OctaneStatus.NEW]: "NEW",
    [OctaneStatus.MODIFIED]: "MODIFIED",
    [OctaneStatus.DELETED]: "DELETED",
    [OctaneStatus.NONE]: "NONE"
  };

  export function getName(num: number): string | null {
    return valueMap[num] ?? null;
  }
}