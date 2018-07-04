//
//  TexturePool.hpp
//  EARenderer
//
//  Created by Pavel Muratov on 7/3/18.
//  Copyright © 2018 MPO. All rights reserved.
//

#ifndef TexturePool_hpp
#define TexturePool_hpp

#include "GLHDRTexture2D.hpp"
#include "GLFramebuffer.hpp"
#include "GLDepthRenderbuffer.hpp"

#include <unordered_set>
#include <memory>

namespace EARenderer {

    class PostprocessTexturePool {
    private:
        using TexturePointerSet = std::unordered_set<std::shared_ptr<GLHDRTexture2D>>;

        GLFramebuffer mFramebuffer;
        GLDepthRenderbuffer mDepthRenderbuffer;
        TexturePointerSet mFreeTextures;
        TexturePointerSet mClaimedTextures;

    public:
        PostprocessTexturePool(const Size2D& resolution);

        std::shared_ptr<GLHDRTexture2D> claim();
        void putBack(std::shared_ptr<GLHDRTexture2D> texture);
        void redirectRenderingToTexture(std::shared_ptr<GLHDRTexture2D> texture);
    };

}

#endif /* TexturePool_hpp */