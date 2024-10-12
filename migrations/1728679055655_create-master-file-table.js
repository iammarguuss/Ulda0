exports.up = pgm => {
    pgm.createTable('master_files', {
      id: { type: 'serial', primaryKey: true },
      signchain: { type: 'varchar(512)', notNull: true },
      content: { type: 'bytea', notNull: true }
    });
  };
  
  exports.down = pgm => {
    pgm.dropTable('master_files');
  };