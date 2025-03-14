import SupportsMoveDetection from "./SupportsMoveDetection";
import SupportsOctaneStatus from "./SupportsOctaneStatus";
import UftoTestAction from "./UftoTestAction";
import { UftoTestType } from "./UftoTestType";

export default interface AutomatedTest extends SupportsOctaneStatus, SupportsMoveDetection {
  id?: string;
  name: string;
  packageName: string;
  oldName?: string;
  oldPackageName?: string | null;
  isMoved?: boolean;
  uftOneTestType: UftoTestType;
  missingScmRepository?: boolean;
  missingTestRunner?: boolean;
  executable: boolean;
  description?: string;
  actions: UftoTestAction[];
}