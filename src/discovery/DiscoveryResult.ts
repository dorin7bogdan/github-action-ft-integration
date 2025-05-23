import { Logger } from '../utils/logger';
import AutomatedTest from '../dto/ft/AutomatedTest';
import ScmResourceFile from '../dto/ft/ScmResourceFile';
import { OctaneStatus } from '../dto/ft/OctaneStatus';

const _logger: Logger = new Logger('Discovery');

export default class DiscoveryResult {
  private readonly _tests: ReadonlyArray<AutomatedTest>;
  private readonly _newTests: ReadonlyArray<AutomatedTest>;
  private readonly _updatedTests: ReadonlyArray<AutomatedTest>;
  private readonly _deletedTests: ReadonlyArray<AutomatedTest>;
  private readonly _scmResxFiles: ReadonlyArray<ScmResourceFile>;
  private readonly _newScmResxFiles: ReadonlyArray<ScmResourceFile>;
  private readonly _updatedScmResxFiles: ReadonlyArray<ScmResourceFile>;
  private readonly _deletedScmResxFiles: ReadonlyArray<ScmResourceFile>;
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

    const { newTests, updatedTests, deletedTests } = this.categorizeTests(tests);
    this._newTests = Object.freeze(newTests);
    this._updatedTests = Object.freeze(updatedTests);
    this._deletedTests = Object.freeze(deletedTests);

    const { newScmResxFiles, updatedScmResxFiles, deletedScmResxFiles } = this.categorizeScmResxFiles(scmResxFiles);
    this._newScmResxFiles = Object.freeze(newScmResxFiles);
    this._updatedScmResxFiles = Object.freeze(updatedScmResxFiles);
    this._deletedScmResxFiles = Object.freeze(deletedScmResxFiles);
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
    return this._newTests;
  }

  public getUpdatedTests(): ReadonlyArray<AutomatedTest> {
    return this._updatedTests;
  }

  public getDeletedTests(): ReadonlyArray<AutomatedTest> {
    return this._deletedTests;
  }

  public getNewScmResxFiles(): ReadonlyArray<ScmResourceFile> {
    return this._newScmResxFiles;
  }

  public getDeletedScmResxFiles(): ReadonlyArray<ScmResourceFile> {
    return this._deletedScmResxFiles;
  }

  public getupdatedScmResxFiles(): ReadonlyArray<ScmResourceFile> {
    return this._updatedScmResxFiles;
  }

  public getScmResxFiles(): ReadonlyArray<ScmResourceFile> {
    return this._scmResxFiles;
  }

  private categorizeTests(tests: AutomatedTest[]): { newTests: AutomatedTest[], updatedTests: AutomatedTest[], deletedTests: AutomatedTest[] } {
    return tests.reduce<{ newTests: AutomatedTest[], updatedTests: AutomatedTest[], deletedTests: AutomatedTest[] }>((acc, test) => {
      if (test.octaneStatus === OctaneStatus.NEW) {
        acc.newTests.push(test);
      } else if (test.octaneStatus === OctaneStatus.MODIFIED) {
        acc.updatedTests.push(test);
      } else if (test.octaneStatus === OctaneStatus.DELETED) {
        acc.deletedTests.push(test);
      }
      return acc;
    }, { newTests: [], updatedTests: [], deletedTests: [] });
  }

  private categorizeScmResxFiles(scmResxFiles: ScmResourceFile[]): { newScmResxFiles: ScmResourceFile[], updatedScmResxFiles: ScmResourceFile[], deletedScmResxFiles: ScmResourceFile[] } {
    return scmResxFiles.reduce<{ newScmResxFiles: ScmResourceFile[], updatedScmResxFiles: ScmResourceFile[], deletedScmResxFiles: ScmResourceFile[] }>((acc, file) => {
      if (file.octaneStatus === OctaneStatus.NEW) {
        acc.newScmResxFiles.push(file);
      } else if (file.octaneStatus === OctaneStatus.MODIFIED) {
        acc.updatedScmResxFiles.push(file);
      } else if (file.octaneStatus === OctaneStatus.DELETED) {
        acc.deletedScmResxFiles.push(file);
      }
      return acc;
    }, { newScmResxFiles: [], updatedScmResxFiles: [], deletedScmResxFiles: [] });
  }
}

