import SupportsOctaneStatus from "./SupportsOctaneStatus";
import UftoTestParam from "./UftoTestParam";
export default interface UftoTestAction extends SupportsOctaneStatus {
  name: string;
  testName: string;
  logicalName?: string;
  description?: string;
  oldTestName?: string;
  repositoryPath?: string;
  parameters?: UftoTestParam[];
  moved?: boolean;
}
