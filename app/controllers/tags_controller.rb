# frozen_string_literal: true

class TagsController < ApplicationController
  def create
    name = params[:name]&.strip
    
    return render json: { success: false, error: "Name is required" }, status: :unprocessable_entity if name.blank?

    # Find or create the tag (case-insensitive)
    tag = Tag.find_or_initialize_by(name: name)
    
    if tag.new_record?
      if tag.save
        render json: { success: true, tag: tag.name, is_new: true }, status: :created
      else
        render json: { success: false, errors: tag.errors.full_messages }, status: :unprocessable_entity
      end
    else
      # Tag already exists
      render json: { success: true, tag: tag.name, is_new: false }, status: :ok
    end
  end
end

