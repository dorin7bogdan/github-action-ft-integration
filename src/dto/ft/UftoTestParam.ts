import OctaneStatus from "./OctaneStatus";
import SupportsOctaneStatus from "./SupportsOctaneStatus";
import { UftoParamDirection } from "./UftoParamDirection";
export default interface UftoTestParam extends SupportsOctaneStatus{
  name?: string;
  direction: UftoParamDirection;
  defaultValue?: string;
}
