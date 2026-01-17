# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_01_17_062239) do
  create_table "pomodoros", force: :cascade do |t|
    t.datetime "completed_at"
    t.date "completed_date"
    t.datetime "created_at", null: false
    t.string "description"
    t.integer "duration_minutes", default: 25
    t.datetime "started_at"
    t.string "tags"
    t.datetime "updated_at", null: false
    t.index ["completed_at"], name: "index_pomodoros_on_completed_at"
    t.index ["completed_date"], name: "index_pomodoros_on_completed_date"
  end

  create_table "tags", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_tags_on_name", unique: true
  end

  create_table "users", force: :cascade do |t|
    t.string "access_token"
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.string "google_tasks_list_id"
    t.string "google_uid", null: false
    t.string "refresh_token"
    t.datetime "token_expires_at"
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["google_uid"], name: "index_users_on_google_uid", unique: true
  end
end
