/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @unrestricted
 */
Bindings.FileSystemWorkspaceBinding = class {
  /**
   * @param {!Workspace.IsolatedFileSystemManager} isolatedFileSystemManager
   * @param {!Workspace.Workspace} workspace
   */
  constructor(isolatedFileSystemManager, workspace) {
    this._isolatedFileSystemManager = isolatedFileSystemManager;
    this._workspace = workspace;
    this._eventListeners = [
      this._isolatedFileSystemManager.addEventListener(
          Workspace.IsolatedFileSystemManager.Events.FileSystemAdded, this._onFileSystemAdded, this),
      this._isolatedFileSystemManager.addEventListener(
          Workspace.IsolatedFileSystemManager.Events.FileSystemRemoved, this._onFileSystemRemoved, this),
      this._isolatedFileSystemManager.addEventListener(
          Workspace.IsolatedFileSystemManager.Events.FileSystemFilesChanged, this._fileSystemFilesChanged, this)
    ];
    /** @type {!Map.<string, !Bindings.FileSystemWorkspaceBinding.FileSystem>} */
    this._boundFileSystems = new Map();
    this._isolatedFileSystemManager.waitForFileSystems().then(this._onFileSystemsLoaded.bind(this));
  }

  /**
   * @param {string} fileSystemPath
   * @return {string}
   */
  static projectId(fileSystemPath) {
    return fileSystemPath;
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {!Array<string>}
   */
  static relativePath(uiSourceCode) {
    var baseURL =
        /** @type {!Bindings.FileSystemWorkspaceBinding.FileSystem}*/ (uiSourceCode.project())._fileSystemBaseURL;
    return uiSourceCode.url().substring(baseURL.length).split('/');
  }

  /**
   * @param {!Workspace.Project} project
   * @param {string} relativePath
   * @return {string}
   */
  static completeURL(project, relativePath) {
    var fsProject = /** @type {!Bindings.FileSystemWorkspaceBinding.FileSystem}*/ (project);
    return fsProject._fileSystemBaseURL + relativePath;
  }

  /**
   * @param {string} extension
   * @return {!Common.ResourceType}
   */
  static _contentTypeForExtension(extension) {
    if (Bindings.FileSystemWorkspaceBinding._styleSheetExtensions.has(extension))
      return Common.resourceTypes.Stylesheet;
    if (Bindings.FileSystemWorkspaceBinding._documentExtensions.has(extension))
      return Common.resourceTypes.Document;
    if (Bindings.FileSystemWorkspaceBinding._imageExtensions.has(extension))
      return Common.resourceTypes.Image;
    if (Bindings.FileSystemWorkspaceBinding._scriptExtensions.has(extension))
      return Common.resourceTypes.Script;
    return Common.resourceTypes.Other;
  }

  /**
   * @param {string} projectId
   * @return {string}
   */
  static fileSystemPath(projectId) {
    return projectId;
  }

  /**
   * @return {!Workspace.IsolatedFileSystemManager}
   */
  fileSystemManager() {
    return this._isolatedFileSystemManager;
  }

  /**
   * @param {!Array<!Workspace.IsolatedFileSystem>} fileSystems
   */
  _onFileSystemsLoaded(fileSystems) {
    for (var fileSystem of fileSystems)
      this._addFileSystem(fileSystem);
  }

  /**
   * @param {!Common.Event} event
   */
  _onFileSystemAdded(event) {
    var fileSystem = /** @type {!Workspace.IsolatedFileSystem} */ (event.data);
    this._addFileSystem(fileSystem);
  }

  /**
   * @param {!Workspace.IsolatedFileSystem} fileSystem
   */
  _addFileSystem(fileSystem) {
    var boundFileSystem = new Bindings.FileSystemWorkspaceBinding.FileSystem(this, fileSystem, this._workspace);
    this._boundFileSystems.set(fileSystem.path(), boundFileSystem);
  }

  /**
   * @param {!Common.Event} event
   */
  _onFileSystemRemoved(event) {
    var fileSystem = /** @type {!Workspace.IsolatedFileSystem} */ (event.data);
    var boundFileSystem = this._boundFileSystems.get(fileSystem.path());
    boundFileSystem.dispose();
    this._boundFileSystems.remove(fileSystem.path());
  }

  /**
   * @param {!Common.Event} event
   */
  _fileSystemFilesChanged(event) {
    var paths = /** @type {!Array<string>} */ (event.data);
    for (var path of paths) {
      for (var key of this._boundFileSystems.keys()) {
        if (!path.startsWith(key))
          continue;
        this._boundFileSystems.get(key)._fileChanged(path);
      }
    }
  }

  dispose() {
    Common.EventTarget.removeEventListeners(this._eventListeners);
    for (var fileSystem of this._boundFileSystems.values()) {
      fileSystem.dispose();
      this._boundFileSystems.remove(fileSystem._fileSystem.path());
    }
  }
};

Bindings.FileSystemWorkspaceBinding._styleSheetExtensions = new Set(['css', 'scss', 'sass', 'less']);
Bindings.FileSystemWorkspaceBinding._documentExtensions = new Set(['htm', 'html', 'asp', 'aspx', 'phtml', 'jsp']);
Bindings.FileSystemWorkspaceBinding._scriptExtensions = new Set([
  'asp', 'aspx', 'c', 'cc', 'cljs', 'coffee', 'cpp', 'cs', 'dart', 'java', 'js',
  'jsp', 'jsx',  'h', 'm',  'mm',   'py',     'sh',  'ts', 'tsx',  'ls'
]);

Bindings.FileSystemWorkspaceBinding._imageExtensions = Workspace.IsolatedFileSystem.ImageExtensions;


/**
 * @implements {Workspace.Project}
 * @unrestricted
 */
Bindings.FileSystemWorkspaceBinding.FileSystem = class extends Workspace.ProjectStore {
  /**
   * @param {!Bindings.FileSystemWorkspaceBinding} fileSystemWorkspaceBinding
   * @param {!Workspace.IsolatedFileSystem} isolatedFileSystem
   * @param {!Workspace.Workspace} workspace
   */
  constructor(fileSystemWorkspaceBinding, isolatedFileSystem, workspace) {
    var fileSystemPath = isolatedFileSystem.path();
    var id = Bindings.FileSystemWorkspaceBinding.projectId(fileSystemPath);
    console.assert(!workspace.project(id));
    var displayName = fileSystemPath.substr(fileSystemPath.lastIndexOf('/') + 1);

    super(workspace, id, Workspace.projectTypes.FileSystem, displayName);

    this._fileSystem = isolatedFileSystem;
    this._fileSystemBaseURL = this._fileSystem.path() + '/';
    this._fileSystemWorkspaceBinding = fileSystemWorkspaceBinding;
    this._fileSystemPath = fileSystemPath;

    workspace.addProject(this);
    this.populate();
  }

  /**
   * @return {string}
   */
  fileSystemPath() {
    return this._fileSystemPath;
  }

  /**
   * @return {!Array<string>}
   */
  gitFolders() {
    return this._fileSystem.gitFolders().map(folder => this._fileSystemPath + '/' + folder);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {string}
   */
  _filePathForUISourceCode(uiSourceCode) {
    return uiSourceCode.url().substring(this._fileSystemPath.length);
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {!Promise<?Workspace.UISourceCodeMetadata>}
   */
  requestMetadata(uiSourceCode) {
    if (uiSourceCode[Bindings.FileSystemWorkspaceBinding._metadata])
      return uiSourceCode[Bindings.FileSystemWorkspaceBinding._metadata];
    var relativePath = this._filePathForUISourceCode(uiSourceCode);
    var promise = this._fileSystem.getMetadata(relativePath).then(onMetadata);
    uiSourceCode[Bindings.FileSystemWorkspaceBinding._metadata] = promise;
    return promise;

    /**
     * @param {?{modificationTime: !Date, size: number}} metadata
     * @return {?Workspace.UISourceCodeMetadata}
     */
    function onMetadata(metadata) {
      if (!metadata)
        return null;
      return new Workspace.UISourceCodeMetadata(metadata.modificationTime, metadata.size);
    }
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {function(?string)} callback
   */
  requestFileContent(uiSourceCode, callback) {
    var filePath = this._filePathForUISourceCode(uiSourceCode);
    var isImage = Bindings.FileSystemWorkspaceBinding._imageExtensions.has(Common.ParsedURL.extractExtension(filePath));

    this._fileSystem.requestFileContent(filePath, isImage ? base64CallbackWrapper : callback);

    /**
     * @param {?string} result
     */
    function base64CallbackWrapper(result) {
      if (!result) {
        callback(result);
        return;
      }
      var index = result.indexOf(',');
      callback(result.substring(index + 1));
    }
  }

  /**
   * @override
   * @return {boolean}
   */
  canSetFileContent() {
    return true;
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {string} newContent
   * @param {function(?string)} callback
   */
  setFileContent(uiSourceCode, newContent, callback) {
    var filePath = this._filePathForUISourceCode(uiSourceCode);
    this._fileSystem.setFileContent(filePath, newContent, callback.bind(this, ''));
  }

  /**
   * @override
   * @return {boolean}
   */
  canRename() {
    return true;
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {string} newName
   * @param {function(boolean, string=, string=, !Common.ResourceType=)} callback
   */
  rename(uiSourceCode, newName, callback) {
    if (newName === uiSourceCode.name()) {
      callback(true, uiSourceCode.name(), uiSourceCode.url(), uiSourceCode.contentType());
      return;
    }

    var filePath = this._filePathForUISourceCode(uiSourceCode);
    this._fileSystem.renameFile(filePath, newName, innerCallback.bind(this));

    /**
     * @param {boolean} success
     * @param {string=} newName
     * @this {Bindings.FileSystemWorkspaceBinding.FileSystem}
     */
    function innerCallback(success, newName) {
      if (!success || !newName) {
        callback(false, newName);
        return;
      }
      console.assert(newName);
      var slash = filePath.lastIndexOf('/');
      var parentPath = filePath.substring(0, slash);
      filePath = parentPath + '/' + newName;
      filePath = filePath.substr(1);
      var extension = this._extensionForPath(newName);
      var newURL = this._fileSystemBaseURL + filePath;
      var newContentType = Bindings.FileSystemWorkspaceBinding._contentTypeForExtension(extension);
      this.renameUISourceCode(uiSourceCode, newName);
      callback(true, newName, newURL, newContentType);
    }
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {string} query
   * @param {boolean} caseSensitive
   * @param {boolean} isRegex
   * @param {function(!Array.<!Common.ContentProvider.SearchMatch>)} callback
   */
  searchInFileContent(uiSourceCode, query, caseSensitive, isRegex, callback) {
    var filePath = this._filePathForUISourceCode(uiSourceCode);
    this._fileSystem.requestFileContent(filePath, contentCallback);

    /**
     * @param {?string} content
     */
    function contentCallback(content) {
      var result = [];
      if (content !== null)
        result = Common.ContentProvider.performSearchInContent(content, query, caseSensitive, isRegex);
      callback(result);
    }
  }

  /**
   * @override
   * @param {!Workspace.ProjectSearchConfig} searchConfig
   * @param {!Array.<string>} filesMathingFileQuery
   * @param {!Common.Progress} progress
   * @param {function(!Array.<string>)} callback
   */
  findFilesMatchingSearchRequest(searchConfig, filesMathingFileQuery, progress, callback) {
    var result = filesMathingFileQuery;
    var queriesToRun = searchConfig.queries().slice();
    if (!queriesToRun.length)
      queriesToRun.push('');
    progress.setTotalWork(queriesToRun.length);
    searchNextQuery.call(this);

    /**
     * @this {Bindings.FileSystemWorkspaceBinding.FileSystem}
     */
    function searchNextQuery() {
      if (!queriesToRun.length) {
        progress.done();
        callback(result);
        return;
      }
      var query = queriesToRun.shift();
      this._fileSystem.searchInPath(searchConfig.isRegex() ? '' : query, progress, innerCallback.bind(this));
    }

    /**
     * @param {!Array.<string>} files
     * @this {Bindings.FileSystemWorkspaceBinding.FileSystem}
     */
    function innerCallback(files) {
      files = files.sort();
      progress.worked(1);
      result = result.intersectOrdered(files, String.naturalOrderComparator);
      searchNextQuery.call(this);
    }
  }

  /**
   * @override
   * @param {!Common.Progress} progress
   */
  indexContent(progress) {
    this._fileSystem.indexContent(progress);
  }

  /**
   * @param {string} path
   * @return {string}
   */
  _extensionForPath(path) {
    var extensionIndex = path.lastIndexOf('.');
    if (extensionIndex === -1)
      return '';
    return path.substring(extensionIndex + 1).toLowerCase();
  }

  populate() {
    var chunkSize = 1000;
    var filePaths = this._fileSystem.filePaths();
    reportFileChunk.call(this, 0);

    /**
     * @param {number} from
     * @this {Bindings.FileSystemWorkspaceBinding.FileSystem}
     */
    function reportFileChunk(from) {
      var to = Math.min(from + chunkSize, filePaths.length);
      for (var i = from; i < to; ++i)
        this._addFile(filePaths[i]);
      if (to < filePaths.length)
        setTimeout(reportFileChunk.bind(this, to), 100);
    }
  }

  /**
   * @override
   * @param {string} url
   */
  excludeFolder(url) {
    var relativeFolder = url.substring(this._fileSystemBaseURL.length);
    if (!relativeFolder.startsWith('/'))
      relativeFolder = '/' + relativeFolder;
    if (!relativeFolder.endsWith('/'))
      relativeFolder += '/';
    this._fileSystem.addExcludedFolder(relativeFolder);

    var uiSourceCodes = this.uiSourceCodes().slice();
    for (var i = 0; i < uiSourceCodes.length; ++i) {
      var uiSourceCode = uiSourceCodes[i];
      if (uiSourceCode.url().startsWith(url))
        this.removeUISourceCode(uiSourceCode.url());
    }
  }

  /**
   * @override
   * @param {string} path
   * @param {?string} name
   * @param {string} content
   * @param {function(?Workspace.UISourceCode)} callback
   */
  createFile(path, name, content, callback) {
    this._fileSystem.createFile(path, name, innerCallback.bind(this));
    var createFilePath;

    /**
     * @param {?string} filePath
     * @this {Bindings.FileSystemWorkspaceBinding.FileSystem}
     */
    function innerCallback(filePath) {
      if (!filePath) {
        callback(null);
        return;
      }
      createFilePath = filePath;
      if (!content) {
        contentSet.call(this);
        return;
      }
      this._fileSystem.setFileContent(filePath, content, contentSet.bind(this));
    }

    /**
     * @this {Bindings.FileSystemWorkspaceBinding.FileSystem}
     */
    function contentSet() {
      callback(this._addFile(createFilePath));
    }
  }

  /**
   * @override
   * @param {string} path
   */
  deleteFile(path) {
    this._fileSystem.deleteFile(path);
    this.removeUISourceCode(path);
  }

  /**
   * @override
   */
  remove() {
    this._fileSystemWorkspaceBinding._isolatedFileSystemManager.removeFileSystem(this._fileSystem);
  }

  /**
   * @param {string} filePath
   * @return {!Workspace.UISourceCode}
   */
  _addFile(filePath) {
    var extension = this._extensionForPath(filePath);
    var contentType = Bindings.FileSystemWorkspaceBinding._contentTypeForExtension(extension);

    var uiSourceCode = this.createUISourceCode(this._fileSystemBaseURL + filePath, contentType);
    this.addUISourceCode(uiSourceCode);
    return uiSourceCode;
  }

  /**
   * @param {string} path
   */
  _fileChanged(path) {
    var uiSourceCode = this.uiSourceCodeForURL(path);
    if (!uiSourceCode) {
      var contentType = Bindings.FileSystemWorkspaceBinding._contentTypeForExtension(this._extensionForPath(path));
      this.addUISourceCode(this.createUISourceCode(path, contentType));
      return;
    }
    uiSourceCode[Bindings.FileSystemWorkspaceBinding._metadata] = null;
    uiSourceCode.checkContentUpdated();
  }

  dispose() {
    this.removeProject();
  }
};

Bindings.FileSystemWorkspaceBinding._metadata = Symbol('FileSystemWorkspaceBinding.Metadata');
