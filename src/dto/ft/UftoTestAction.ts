import SupportsOctaneStatus from "./SupportsOctaneStatus";
import UftoTestParam from "./UftoTestParam";
export default interface UftoTestAction extends SupportsOctaneStatus {
  id?: string;
  name: string;
  logicalName?: string;
  repositoryPath?: string;
  testName?: string;
  description?: string;
  oldTestName?: string;
  parameters?: UftoTestParam[];
  moved?: boolean;
}
