import './room';
import bodyCosts from './body-costs';

const roles = {
  harvester() {
    if (this.carry.energy < this.carryCapacity || this.carry.energy === 0) {
      const source = this.targetSource();
      this.moveToAndHarvest(source);
    } else if (this.room.courierCount() === 0 && this.getSpawn().availableEnergy() < 300) {
      this.deliverEnergyTo(this.getSpawn());
    } else {
      const storage = this.room.getStorage();
      const links = this.room.getLinks();
      const closestLink = this.pos.findClosestByRange(links);
      const rangeToStore = storage ? this.pos.getRangeTo(storage) : 100;

      if (storage && storage.store.energy < storage.storeCapacity * 0.3 && rangeToStore === 1) {
        this.deliverEnergyTo(storage);
      } else if (links.length && this.pos.getRangeTo(closestLink) === 1 && !closestLink.isFull()) {
        this.deliverEnergyTo(closestLink);
      } else if (storage && storage.store.energy < storage.storeCapacity && rangeToStore === 1) {
        this.deliverEnergyTo(storage);
      } else {
        this.dropEnergy();
      }
    }
  },

  scoutharvester() {
    if (this.findUnvisitedScoutFlags().length > 0) {
      this.scout();
    } else {
      const sourcesNeedingHarvesters = this.room.getSourcesNeedingHarvesters();
      if (sourcesNeedingHarvesters.length > 0) {
        this.memory.role = 'harvester';
        this.memory.oldRole = 'scoutharvester';
        this.memory.source = sourcesNeedingHarvesters[0].id;
      }
    }
  },

  courier() {
    const potentialTargets = this.room.getMyStructures().filter(structure => {
      const notALink = structure.structureType !== STRUCTURE_LINK;
      return structure.energyCapacity && structure.energy < structure.energyCapacity && notALink;
    });

    let dumpTarget = this.pos.findClosestByRange(potentialTargets);

    if (this.carry.energy === this.carryCapacity) {
      this.memory.task = 'deliver';
    } else if (!dumpTarget || this.carry.energy === 0) {
      this.memory.task = 'pickup';
    }

    if (!dumpTarget) {
      dumpTarget = this.room.getControllerEnergyDropFlag();
    }

    if (this.memory.task === 'pickup') {
      if (!this.memory.target) {
        const target = this.room.getEnergySourcesThatNeedsStocked()[0];
        this.memory.target = target ? target.id : '';
      }

      if (this.memory.target) {
        const target = Game.getObjectById(this.memory.target);
        let result;
        if (target) {
          result = this.takeEnergyFrom(target);
        }
        if (!target || result === 0) {
          this.memory.target = '';
        }
      } else {
        this.deliverEnergyTo(dumpTarget);
      }
    } else {
      this.deliverEnergyTo(dumpTarget);
    }
  },

  builder() {
    if (this.carry.energy === this.carryCapacity) {
      this.memory.task = 'work';
    } else if (this.carry.energy === 0 || this.memory.task === 'stockup') {
      this.memory.target = null;
      this.memory.task = 'stockup';
      if (this.room.droppedControllerEnergy()) {
        this.takeEnergyFrom(this.room.droppedControllerEnergy());
      } else if (this.room.getControllerLink() && !this.room.getControllerLink().isEmpty()) {
        this.takeEnergyFrom(this.room.getControllerLink());
      } else if (this.room.getStorage() && !this.room.getStorage().isEmpty()) {
        this.takeEnergyFrom(this.room.getStorage());
      }
    }

    if (this.memory.task === 'work') {
      const constructionSites = this.room.getConstructionSites();
      if (constructionSites.length) {
        const closestConstructionSite = this.pos.findClosestByRange(constructionSites);
        this.moveToAndBuild(closestConstructionSite);
      } else if (this.memory.target) {
        const target = Game.getObjectById(this.memory.target);
        if (target.hits < target.hitsMax) {
          this.moveToAndRepair(target);
        } else {
          this.memory.target = null;
        }
      } else {
        const damagedStructures = this.room.getStructures().sort((structureA, structureB) => {
          return (structureA.hits / structureA.hitsMax) - (structureB.hits / structureB.hitsMax);
        });

        if (damagedStructures.length) {
          this.memory.target = damagedStructures[0].id;
        }
      }
    }
  },

  upgrader() {
    const empty = this.carry.energy === 0;
    if (!empty) {
      this.moveToAndUpgrade(this.room.controller);
    } else if (empty && this.room.droppedControllerEnergy()) {
      this.takeEnergyFrom(this.room.droppedControllerEnergy());
    } else if (empty && this.room.getLinks().length) {
      const closestLink = this.pos.findClosestByRange(this.room.getLinks());
      if (this.pos.getRangeTo(closestLink) < 5) {
        this.takeEnergyFrom(closestLink);
      } else {
        this.moveToAndUpgrade(this.room.controller);
      }
    }
  },

  roadworker() {
    if (this.carry.energy === 0) {
      const closestEnergySource = this.pos.findClosestByRange(this.room.getEnergyStockSources());
      if (closestEnergySource) {
        this.takeEnergyFrom(closestEnergySource);
      }
    } else {
      const roads = this.room.getRoads().filter(road => {
        return road.hits < road.hitsMax;
      });
      if (roads.length) {
        const road = this.pos.findClosestByRange(roads);
        this.moveToAndRepair(road);
      } else {
        this.suicide();
      }
    }
  },

  mailman() {
    if (this.carry.energy === 0) {
      this.memory.task = 'stock';
    } else if (this.carry.energy === this.carryCapacity) {
      this.memory.task = 'deliver';
    }

    if (this.memory.task === 'deliver') {
      const target = this.pos.findClosestByRange(this.room.myCreeps().filter(creep => {
        return creep.needsEnergyDelivered();
      }));
      if (target) {
        this.deliverEnergyTo(target);
      }
    } else {
      const closestEnergySource = this.pos.findClosestByRange(this.room.getEnergyStockSources());
      if (closestEnergySource) {
        this.takeEnergyFrom(closestEnergySource);
      }
    }
  },

  claimer() {
    if (this.findUnvisitedScoutFlags().length > 0) {
      this.scout();
    } else if (!this.room.getControllerOwned()) {
      this.moveToAndClaimController(this.room.controller);
    }
  },

  scout() {
    if (this.findUnvisitedScoutFlags().length > 0) {
      if (this.room.getDismantleFlag()) {
        this.dismantleFlag(this.room.getDismantleFlag());
      } else {
        this.scout();
      }
    } else if (this.room.getConstructionSites().length && this.carry.energy > 0) {
      this.moveToAndBuild(this.pos.findClosestByRange(this.room.getConstructionSites()));
    } else if (this.carry.energy === 0) {
      const droppedEnergies = this.room.getDroppedEnergy();
      if (droppedEnergies.length > 0) {
        this.takeEnergyFrom(droppedEnergies[0]);
      }
    } else {
      this.moveToAndUpgrade(this.room.controller);
    }
  },
};

Creep.prototype.work = function work() {
  const creepFlag = Game.flags[this.name];
  // move to creep flag if it is defined.
  if (creepFlag !== undefined) {
    if (this.pos.getRangeTo(creepFlag) === 0) {
      creepFlag.remove();
    } else {
      this.moveTo(creepFlag);
    }
  } else if (this.memory.role && roles[this.memory.role]) {
    roles[this.memory.role].call(this);
  }
};

Creep.prototype.targetSource = function target() {
  return this.room.getSources().filter(source => {
    return this.memory.source === source.id;
  })[0];
};

Creep.prototype.getSpawn = function getSpawn() {
  const validSpawns = Object.keys(Game.spawns).filter(spawnName => {
    const spawn = Game.spawns[spawnName];
    return spawn.room === this.room;
  });
  return validSpawns.length ? Game.spawns[validSpawns[0]] : Game.spawns(this.memory.spawn);
};

Creep.prototype.moveToAndClaimController = function moveToAndClaimController(controller) {
  if (this.pos.getRangeTo(controller) > 1) {
    this.moveTo(controller);
  } else {
    if (this.claimController(controller) === 0) {
      const claimFlag = Game.claimFlags().filter(flag => {
        return flag.pos.getRangeTo(controller) === 0;
      })[0];

      if (claimFlag) {
        claimFlag.remove();
      }
    }
  }
};

Creep.prototype.moveToThenDrop = function moveToThenDrop(target) {
  if (this.pos.getRangeTo(target) > 1) {
    this.moveTo(target);
  } else {
    this.dropEnergy();
  }
};

const originalMoveTo = Creep.prototype.moveTo;
Creep.prototype.moveTo = function moveTo(...myArgs) {
  const args = [].map.call(myArgs, arg => { return arg; });
  const whitelist = ['upgrader', 'claimer', 'scout'];
  let potentialOptions;
  if (typeof myArgs[0] === 'number') {
    potentialOptions = args[2];
  } else {
    potentialOptions = args[1];
  }
  if (!potentialOptions) {
    potentialOptions = {};
    args.push(potentialOptions);
  }

  const whitelisted = whitelist.indexOf(this.memory.role) !== -1;
  if (!whitelisted && this.room.controller && typeof potentialOptions === 'object') {
    const coord = this.room.controller.pos;
    const avoid = [];
    for (let x = coord.x - 1; x <= coord.x + 1; x++) {
      for (let y = coord.y - 1; y <= coord.y + 1; y++) {
        avoid.push({ x, y });
      }
    }

    if (potentialOptions.avoid) {
      potentialOptions.avoid = potentialOptions.avoid.concat(avoid);
    } else {
      potentialOptions.avoid = avoid;
    }
  }

  if (!potentialOptions.reusePath) {
    potentialOptions.reusePath = 20;
  }

  return originalMoveTo.apply(this, args);
};

Creep.prototype.moveToAndHarvest = function moveToAndHarvest(target) {
  if (this.pos.getRangeTo(target) > 1) {
    this.moveTo(target);
  } else {
    this.harvest(target);
  }
};

Creep.prototype.moveToAndUpgrade = function moveToAndUpgrade(target) {
  if (this.pos.getRangeTo(target) > 1) {
    this.moveTo(this.room.controller);
  } else {
    this.upgradeController(this.room.controller);
  }
};

Creep.prototype.moveToAndBuild = function moveToAndBuild(target) {
  const range = this.pos.getRangeTo(target);
  if (range > 1) {
    this.moveTo(target);
  }
  if (range <= 3) {
    this.build(target);
  }
};

Creep.prototype.hasVisitedFlag = function hasVisitedFlag(flag) {
  const visitedFlags = this.memory.visitedFlags || [];
  return visitedFlags.indexOf(flag.name) !== -1;
};

Creep.prototype.findUnvisitedScoutFlags = function findUnvisitedScoutFlags() {
  if (!this._unvisitedFlags) {
    const flags = Game.getScoutFlags();
    this._unvisitedFlags = flags.filter((flag) => {
      return !this.hasVisitedFlag(flag);
    });
  }
  return this._unvisitedFlags;
};

Creep.prototype.dismantleFlag = function dismantleFlag(flag) {
  const structure = this.room.getStructureAt(flag.pos);
  if (structure) {
    this.moveToAndDismantle(structure);
  } else {
    flag.remove();
  }
};

Creep.prototype.moveToAndDismantle = function moveToAndDismantle(target) {
  if (this.pos.getRangeTo(target) === 1) {
    this.dismantle(target);
  } else {
    this.moveTo(target);
  }
};

Creep.prototype.scout = function scout() {
  const unvisitedFlags = this.findUnvisitedScoutFlags();
  unvisitedFlags.sort((flagA, flagB) => {
    return parseInt(flagA.name, 10) - parseInt(flagB.name, 10);
  });
  let targetFlag = unvisitedFlags[0];
  if (this.pos.getRangeTo(targetFlag) === 0) {
    if (!this.memory.visitedFlags) {
      this.memory.visitedFlags = [];
    }
    this.memory.visitedFlags.push(targetFlag.name);
    targetFlag = unvisitedFlags[1];
  }
  this.moveTo(targetFlag, { reusePath: 50 });
};

Creep.prototype.moveToAndRepair = function moveToAndRepair(target) {
  const range = this.pos.getRangeTo(target);
  if (range > 1) {
    this.moveTo(target);
  }
  if (range <= 3) {
    this.repair(target);
  }
};

Creep.prototype.takeEnergyFrom = function takeEnergyFrom(target) {
  const range = this.pos.getRangeTo(target);
  if (target instanceof Energy) {
    if (range > 1) {
      this.moveTo(target);
    }
    return this.pickup(target);
  }
  if (range > 1) {
    this.moveTo(target);
  }
  return target.transferEnergy(this);
};

Creep.prototype.deliverEnergyTo = function deliverEnergyTo(target) {
  const range = this.pos.getRangeTo(target);
  if (target instanceof Flag) {
    if (range === 0) {
      this.dropEnergy();
    } else {
      this.moveTo(target);
    }
  } else {
    if (range <= 1) {
      this.transferEnergy(target);
    } else {
      this.moveTo(target);
    }
  }
};

Creep.prototype.needsOffloaded = function needsOffloaded() {
  return this.carry.energy / this.carryCapacity > 0.6;
};

Creep.prototype.needsEnergyDelivered = function needsEnergyDelivered() {
  const blacklist = ['harvester', 'courier', 'mailman'];
  if (blacklist.indexOf(this.memory.role) !== -1) {
    return false;
  }

  return this.carry.energy / this.carryCapacity < 0.6;
};

Creep.prototype.cost = function cost() {
  return bodyCosts.calculateCosts(this.body);
};
