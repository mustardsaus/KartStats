-- One-time: point the live circuits table at the real track photography
-- added to /public/circuits. Only needed once, after deploying this update
-- — safe to re-run any time (each row is just overwritten with the same
-- value). Every circuit now has a real photo, including GCN Mario Circuit,
-- Daisy Circuit, GCN DK Mountain, and SNES Ghost Valley 2.

update circuits set image_url = '/circuits/luigi-circuit.jpg' where id = 'luigi-circuit';
update circuits set image_url = '/circuits/moo-moo-meadows.jpg' where id = 'moo-moo-meadows';
update circuits set image_url = '/circuits/mushroom-gorge.jpg' where id = 'mushroom-gorge';
update circuits set image_url = '/circuits/toads-factory.jpg' where id = 'toads-factory';
update circuits set image_url = '/circuits/mario-circuit.jpg' where id = 'mario-circuit';
update circuits set image_url = '/circuits/coconut-mall.jpg' where id = 'coconut-mall';
update circuits set image_url = '/circuits/dk-summit.jpg' where id = 'dk-summit';
update circuits set image_url = '/circuits/warios-gold-mine.jpg' where id = 'warios-gold-mine';
update circuits set image_url = '/circuits/daisy-circuit.jpg' where id = 'daisy-circuit';
update circuits set image_url = '/circuits/koopa-cape.jpg' where id = 'koopa-cape';
update circuits set image_url = '/circuits/maple-treeway.jpg' where id = 'maple-treeway';
update circuits set image_url = '/circuits/grumble-volcano.jpg' where id = 'grumble-volcano';
update circuits set image_url = '/circuits/dry-dry-ruins.jpg' where id = 'dry-dry-ruins';
update circuits set image_url = '/circuits/moonview-highway.jpg' where id = 'moonview-highway';
update circuits set image_url = '/circuits/bowsers-castle.jpg' where id = 'bowsers-castle';
update circuits set image_url = '/circuits/rainbow-road.jpg' where id = 'rainbow-road';
update circuits set image_url = '/circuits/gcn-peach-beach.jpg' where id = 'gcn-peach-beach';
update circuits set image_url = '/circuits/ds-yoshi-falls.jpg' where id = 'ds-yoshi-falls';
update circuits set image_url = '/circuits/snes-ghost-valley-2.jpg' where id = 'snes-ghost-valley-2';
update circuits set image_url = '/circuits/n64-mario-raceway.jpg' where id = 'n64-mario-raceway';
update circuits set image_url = '/circuits/n64-sherbet-land.jpg' where id = 'n64-sherbet-land';
update circuits set image_url = '/circuits/gba-shy-guy-beach.jpg' where id = 'gba-shy-guy-beach';
update circuits set image_url = '/circuits/ds-delfino-square.jpg' where id = 'ds-delfino-square';
update circuits set image_url = '/circuits/gcn-waluigi-stadium.jpg' where id = 'gcn-waluigi-stadium';
update circuits set image_url = '/circuits/ds-desert-hills.jpg' where id = 'ds-desert-hills';
update circuits set image_url = '/circuits/gba-bowser-castle-3.jpg' where id = 'gba-bowser-castle-3';
update circuits set image_url = '/circuits/n64-dks-jungle-parkway.jpg' where id = 'n64-dks-jungle-parkway';
update circuits set image_url = '/circuits/gcn-mario-circuit.jpg' where id = 'gcn-mario-circuit';
update circuits set image_url = '/circuits/snes-mario-circuit-3.jpg' where id = 'snes-mario-circuit-3';
update circuits set image_url = '/circuits/ds-peach-gardens.jpg' where id = 'ds-peach-gardens';
update circuits set image_url = '/circuits/gcn-dk-mountain.jpg' where id = 'gcn-dk-mountain';
update circuits set image_url = '/circuits/n64-bowsers-castle.jpg' where id = 'n64-bowsers-castle';
