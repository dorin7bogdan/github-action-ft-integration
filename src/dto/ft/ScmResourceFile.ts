import SupportsMoveDetection from "./SupportsMoveDetection";
import SupportsOctaneStatus from "./SupportsOctaneStatus";

export default interface ScmResourceFile extends SupportsMoveDetection, SupportsOctaneStatus {
  id?: string;
  oldName?: string;
  oldRelativePath?: string;
  isMoved?: boolean;
  name: string;
  relativePath: string;
}