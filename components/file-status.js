'use strict';

const fs       = require('fs');
const NodeGit  = require('nodegit');
const path     = require('path');
const Vue      = require('vue/dist/vue');

const fileDiff = require('./file-diff');
const toolbar  = require('./toolbar');

Vue.component('file-status', {
  props: [
    'activeRepository',
    'isIndexView',
    'file'
  ],
  data: function () {
    let stage = {
      label: 'Stage File',
      className: 'stage',
      iconClass: 'fa fa-arrow-circle-up',
      click: () => this.stageFile()
    };
    let unstage = {
      label: 'Unstage File',
      className: 'unstage',
      iconClass: 'fa fa-arrow-circle-down',
      click: () => this.unstageFile()
    };

    return {
      actionClass: `action-${this.getActionName()}`,
      active: false,
      buttons: [
        {
          label: 'Refresh',
          className: 'refresh',
          iconClass: 'fa fa-refresh',
          click: () => this.$refs.fileDiff.refresh()
        },
        this.isIndexView ? unstage : stage
      ]
    };
  },
  methods: {
    activate: function () {
      this.active = !this.active;
    },
    getActionName: function () {
      let status = this.file.status();
      if ((this.isIndexView && status.includes('INDEX_NEW'))
        || (!this.isIndexView && status.includes('WT_NEW'))) {
        return 'add';
      }
      if ((this.isIndexView && status.includes('INDEX_DELETED'))
        || (!this.isIndexView && status.includes('WT_DELETED'))) {
        return 'delete';
      }
      return 'edit';
    },
    getLeft: async function () {
      if (this.isIndexView) {
        return this.file.isNew() ? '' : this.getHeadContent();
      } else {
        return this.file.isNew() && !this.file.inIndex() ? '' : this.getIndexContent();
      }
    },
    getRight: async function () {
      if (this.isIndexView) {
        return this.file.status().includes('INDEX_DELETED') ? '' : this.getIndexContent();
      } else {
        return this.file.status().includes('WT_DELETED') ? '' : this.getWorkingContent();
      }
    },
    getHeadContent: async function () {
      const repo   = await NodeGit.Repository.open(this.activeRepository.path);
      const commit = await repo.getHeadCommit();
      const entry  = await commit.getEntry(this.file.path());
      const blob   = await entry.getBlob();

      return blob.content();
    },
    getIndexContent: async function () {
      const repo   = await NodeGit.Repository.open(this.activeRepository.path);
      const index  = await repo.refreshIndex();
      const oid    = index.getByPath(this.file.path()).id;
      const blob   = await repo.getBlob(oid);

      return blob.content();
    },
    getWorkingContent: async function () {
      const fullPath = path.join(this.activeRepository.path, this.file.path());
      return new Promise(resolve => {
        fs.readFile(fullPath, null, (error, data) => resolve(data));
      });
    },
    stageFile: async function () {
      const repo  = await NodeGit.Repository.open(this.activeRepository.path);
      const index = await repo.refreshIndex();

      if (this.file.status().includes('WT_DELETED')) {
        await index.removeByPath(this.file.path());
      } else {
        await index.addByPath(this.file.path());
      }
      await index.write();
      await index.writeTree();

      this.$emit('statusChanged', this.file);
    },
    unstageFile: async function () {
      let repo = await NodeGit.Repository.open(this.activeRepository.path)

      if (this.file.isNew()) {
        const index = await repo.refreshIndex();
        await index.removeByPath(this.file.path());
        await index.write();
        await index.writeTree();
      } else {
        const commit = await repo.getHeadCommit();
        const result = await NodeGit.Reset.default(repo, commit, [this.file.path()]);
      }

      this.$emit('statusChanged', this.file);
    }
  },
  template: `
    <div v-bind:class="['file-status', actionClass, { active }]">
      <div class="header" v-on:click="activate">
        <span class="filename">
          <i v-bind:class="['fa', { 'fa-caret-right': !active, 'fa-caret-down': active }]"></i>
          {{ file.path() }}
        </span>
        <toolbar v-bind:buttons="buttons"></toolbar>
      </div>
      <file-diff
        ref="fileDiff"
        v-if="active"
        v-bind:file="file"
        v-bind:getLeft="getLeft"
        v-bind:getRight="getRight">
      </file-diff>
    </div>
  `
});