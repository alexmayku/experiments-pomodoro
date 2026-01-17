class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.string :email, null: false
      t.string :google_uid, null: false
      t.string :access_token
      t.string :refresh_token
      t.datetime :token_expires_at
      t.string :google_tasks_list_id

      t.timestamps
    end

    add_index :users, :google_uid, unique: true
    add_index :users, :email, unique: true
  end
end
