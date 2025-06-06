import { Logger } from '../utils/logger';
import AutomatedTest from '../dto/ft/AutomatedTest';
import ScmResourceFile from '../dto/ft/ScmResourceFile';
import { OctaneStatus } from '../dto/ft/OctaneStatus';

const _logger: Logger = new Logger('Discovery');

export default class DiscoveryResult {
  private readonly _tests: ReadonlyArray<AutomatedTest>;
  private readonly _scmResxFiles: ReadonlyArray<ScmResourceFile>;
  private readonly _hasChanges: boolean = false;
  private readonly _newCommit: string;
  private readonly _isFullSync: boolean;
  constructor(newCommit: string, tests: AutomatedTest[], scmResxFiles: ScmResourceFile[], isFullSync: boolean) {
    _logger.debug('DiscoveryResult constructor ...');
    this._newCommit = newCommit;
    this._isFullSync = isFullSync;
    this._tests = Object.freeze(tests);
    this._scmResxFiles = Object.freeze(scmResxFiles);
    this._hasChanges = tests.length > 0 || scmResxFiles.length > 0;
  }

  public isFullSync(): boolean {
    return this._isFullSync;
  }

  public getNewCommit(): string {
    return this._newCommit;
  }

  public hasChanges(): boolean {
    return this._hasChanges;
  }

  public getAllTests(): ReadonlyArray<AutomatedTest> {
    return this._tests;
  }

  public getNewTests(): ReadonlyArray<AutomatedTest> {
    return this._tests.filter(t => t.octaneStatus == OctaneStatus.NEW);
  }

  public getUpdatedTests(): ReadonlyArray<AutomatedTest> {
    return this._tests.filter(t => t.octaneStatus == OctaneStatus.MODIFIED);
  }

  public getDeletedTests(): ReadonlyArray<AutomatedTest> {
    return this._tests.filter(t => t.octaneStatus == OctaneStatus.DELETED);
  }

  public getScmResxFiles(): ReadonlyArray<ScmResourceFile> {
    return this._scmResxFiles;
  }
}

